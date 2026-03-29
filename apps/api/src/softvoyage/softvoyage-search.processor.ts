/**
 * Softvoyage Search Processor
 *
 * BullMQ processor for VACATION_SEARCH queue. Navigates the Softvoyage VCO
 * public widget via Playwright, parses HTML results, and caches them in Redis.
 *
 * The VCO auto-creates sessions on search — no login is needed.
 * Configuration: code_ag=VCO, alias=YAQ (defaults, overridable via env).
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'
import Redis from 'ioredis'
import { QUEUES } from '../automation/automation.types'
import type { VacationSearchJobData } from '../automation/automation.types'
import { SoftvoyageBrowserPoolService } from './softvoyage-browser-pool.service'
import { SoftvoyageResultParserService } from './softvoyage-result-parser.service'

// Default cache TTL: 15 minutes
const DEFAULT_CACHE_TTL = 900

@Processor(QUEUES.VACATION_SEARCH, { concurrency: 2 })
@Injectable()
export class SoftvoyageSearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SoftvoyageSearchProcessor.name)
  private readonly redis: Redis | null
  private readonly vcoBaseUrl: string
  private readonly codeAg: string
  private readonly alias: string
  private readonly cacheTtl: number

  constructor(
    private readonly browserPool: SoftvoyageBrowserPoolService,
    private readonly resultParser: SoftvoyageResultParserService,
    private readonly configService: ConfigService,
  ) {
    super()

    this.vcoBaseUrl = this.configService.get<string>(
      'SOFTVOYAGE_VCO_BASE_URL',
      'https://vco.sax.softvoyage.com/cgi-bin',
    )
    this.codeAg = this.configService.get<string>('SOFTVOYAGE_VCO_CODE_AG', 'VCO')
    this.alias = this.configService.get<string>('SOFTVOYAGE_VCO_ALIAS', 'YAQ')
    this.cacheTtl = parseInt(
      this.configService.get<string>('VACATION_PRICING_CACHE_TTL', `${DEFAULT_CACHE_TTL}`),
      10,
    )

    // Initialize Redis client for caching results
    const redisUrl = this.configService.get<string>('REDIS_URL')
    if (redisUrl) {
      try {
        const url = new URL(redisUrl)
        const config: Record<string, unknown> = {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        }
        if (url.password) config.password = url.password
        if (url.username) config.username = url.username
        if (url.protocol === 'rediss:') config.tls = {}

        this.redis = new Redis(config as ConstructorParameters<typeof Redis>[0])
        this.logger.log('Redis client initialized for vacation search cache')
      } catch (err) {
        this.logger.warn(`Failed to initialize Redis client: ${err}`)
        this.redis = null
      }
    } else {
      this.logger.warn('REDIS_URL not configured — search results will not be cached')
      this.redis = null
    }
  }

  // ---------------------------------------------------------------------------
  // Main processor
  // ---------------------------------------------------------------------------

  async process(job: Job<VacationSearchJobData>): Promise<{ cacheKey: string; resultCount: number }> {
    const { gatewayCode, destDep, dateDep, duration, nbAdults, nbRooms, allInclusive, cacheKey } =
      job.data

    this.logger.log(
      `Processing vacation search: ${gatewayCode} -> ${destDep}, ${dateDep}, ${duration}n, ${nbAdults}a, ${nbRooms}r [${job.id}]`,
    )

    // Use browser pool (has puppeteer-extra stealth applied at module level)
    let page: Awaited<ReturnType<SoftvoyageBrowserPoolService['acquirePage']>> | null = null

    try {
      page = await this.browserPool.acquirePage()

      // Set up proxy authentication if configured
      const proxyUrl = this.configService.get<string>('RESIDENTIAL_PROXY_URL')
      if (proxyUrl) {
        const proxyParsed = new URL(proxyUrl)
        if (proxyParsed.username) {
          await page.authenticate({
            username: decodeURIComponent(proxyParsed.username),
            password: decodeURIComponent(proxyParsed.password),
          })
        }
      }
      this.logger.log(`Acquired browser page for search [${job.id}]${proxyUrl ? ' (with proxy)' : ''}`)

      // 2. Navigate to query form page first to establish VCO session
      const queryUrl = `${this.vcoBaseUrl}/querypackage.cgi?code_ag=${this.codeAg}&alias=${this.alias}&language=en`
      this.logger.debug(`Navigating to query form: ${queryUrl}`)
      await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

      // 3. Build the search URL with POST form data and navigate
      const resultsUrl = `${this.vcoBaseUrl}/resultspackage.cgi`
      const formParams = new URLSearchParams({
        code_ag: this.codeAg,
        alias: this.alias,
        language: 'en',
        gateway_dep: gatewayCode,
        dest_dep: destDep,
        date_dep: dateDep,
        duration: duration,
        nb_adult_forf: String(nbAdults),
        nb_rooms: String(nbRooms),
        all_inclusive: allInclusive ? 'Y' : 'N',
        price_max: '99999',
      })

      this.logger.debug(`Submitting search form to ${resultsUrl}`)

      // Submit form via POST and wait for navigation
      const formBody = formParams.toString()
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.evaluate((url: string, body: string) => {
          const form = document.createElement('form')
          form.method = 'POST'
          form.action = url

          for (const [key, value] of new URLSearchParams(body).entries()) {
            const input = document.createElement('input')
            input.type = 'hidden'
            input.name = key
            input.value = value
            form.appendChild(input)
          }

          document.body.appendChild(form)
          form.submit()
        }, resultsUrl, formBody),
      ])

      // 4. Wait for initial results page to load
      try {
        await page.waitForSelector('div[id^="result-"], table[id^="hotel-"]', { timeout: 30000 })
      } catch {
        this.logger.warn('No result elements found on initial page')
      }

      // 5. Get the results page HTML (initial page has hotel cards with basic pricing)
      const html = await page.content()
      this.logger.log(`Results page: ${html.length} bytes`)

      // 6. Release page back to pool
      await this.browserPool.releasePage(page)
      page = null

      this.logger.debug(`Got HTML response (${html.length} bytes), parsing results...`)

      // Temporary: save raw HTML to Redis for debugging parser selectors
      if (this.redis) {
        try {
          await this.redis.set('vco:debug:raw-html', html, 'EX', 600) // 10 min
          this.logger.log(`Saved ${html.length} bytes of raw VCO HTML to Redis for debugging`)
        } catch {}
      }

      // 7. Parse HTML via result parser
      const results = this.resultParser.parseResults(html)
      this.logger.log(
        `Parsed ${results.length} hotel results for ${gatewayCode} -> ${destDep} [${job.id}]`,
      )

      // 8. Cache results in Redis (with fetchedAt timestamp)
      const fetchedAt = new Date().toISOString()
      if (this.redis && results.length > 0) {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ results, fetchedAt }),
            'EX',
            this.cacheTtl,
          )
          this.logger.debug(`Cached ${results.length} results at key ${cacheKey} (TTL: ${this.cacheTtl}s)`)
        } catch (err) {
          this.logger.warn(`Failed to cache results: ${err}`)
        }
      }

      return { cacheKey, resultCount: results.length }
    } catch (error) {
      this.logger.error(
        `Vacation search failed for ${gatewayCode} -> ${destDep} [${job.id}]: ${error}`,
      )
      throw error // Let BullMQ retry
    } finally {
      if (page) {
        try {
          await this.browserPool.releasePage(page)
        } catch {
          // Pool may be shutting down
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Worker events
  // ---------------------------------------------------------------------------

  @OnWorkerEvent('failed')
  onFailed(job: Job<VacationSearchJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.data.gatewayCode} -> ${job.data.destDep}) failed after ${job.attemptsMade} attempts: ${error.message}`,
    )
  }
}
