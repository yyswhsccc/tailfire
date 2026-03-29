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

    // Launch a fresh browser for each search to avoid DataDome session contamination.
    // puppeteer-extra stealth plugin must be applied before launch.
    const puppeteer = (await import('puppeteer-extra')).default
    const executablePath = this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || '/usr/bin/chromium'
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
    let page: Awaited<ReturnType<typeof puppeteer.launch extends (...args: any) => Promise<infer R> ? R extends { newPage: () => Promise<infer P> } ? () => Promise<P> : never : never>> | null = null

    try {
      // Build launch args — add residential proxy if configured
      const proxyUrl = this.configService.get<string>('RESIDENTIAL_PROXY_URL')
      const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080']
      if (proxyUrl) {
        // Format: http://user:pass@host:port
        const proxyParsed = new URL(proxyUrl)
        launchArgs.push(`--proxy-server=${proxyParsed.protocol}//${proxyParsed.hostname}:${proxyParsed.port}`)
      }

      browser = await puppeteer.launch({
        executablePath,
        headless: 'shell' as any,
        args: launchArgs,
      })
      page = await browser.newPage()

      // Authenticate proxy if credentials provided
      if (proxyUrl) {
        const proxyParsed = new URL(proxyUrl)
        if (proxyParsed.username) {
          await page.authenticate({
            username: decodeURIComponent(proxyParsed.username),
            password: decodeURIComponent(proxyParsed.password),
          })
        }
        this.logger.log(`Fresh browser launched with residential proxy for search [${job.id}]`)
      } else {
        this.logger.log(`Fresh browser launched (no proxy) for search [${job.id}]`)
      }

      // 2. Navigate to query form page first to establish VCO session
      const queryUrl = `${this.vcoBaseUrl}/querypackage.cgi?code_ag=${this.codeAg}&alias=${this.alias}&language=en`
      this.logger.debug(`Navigating to query form: ${queryUrl}`)
      await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

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
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
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
        await page.waitForSelector('div[id^="result-"], table[id^="hotel-"]', { timeout: 15000 })
      } catch {
        this.logger.warn('No result elements found on initial page')
      }

      // 5. Extract SID and search_id, then fetch full results via AJAX endpoint
      //    The initial page only shows hotel cards; pricing loads via AJAX
      let html = await page.content()

      const sidMatch = html.match(/sid=([a-f0-9]{32})/)
      const searchIdMatch = html.match(/search_id=([a-f0-9]{32})/)

      if (sidMatch && searchIdMatch) {
        const sid = sidMatch[1]
        const searchId = searchIdMatch[1]
        this.logger.debug(`VCO session: sid=${sid?.substring(0, 8)}..., searchId=${searchId?.substring(0, 8)}...`)

        // Fetch full results with pricing via AJAX endpoint
        const ajaxUrl = `${this.vcoBaseUrl}/resultspackage.cgi?language=en&sid=${sid}&search_id=${searchId}&code_ag=${this.codeAg}&alias=${this.alias}&flex=N&combine_date_dep=N&query_timestamp=${Date.now()}&action=results&_=${Date.now()}`
        this.logger.debug(`Fetching AJAX results: ${ajaxUrl.substring(0, 80)}...`)

        try {
          await page.goto(ajaxUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
          html = await page.content()
          this.logger.debug(`AJAX results: ${html.length} bytes`)
        } catch (ajaxErr) {
          this.logger.warn(`AJAX results fetch failed, using initial page: ${ajaxErr}`)
        }
      } else {
        this.logger.warn('Could not extract SID/searchId from results page — using initial HTML')
      }

      // 6. Close browser immediately after getting HTML (fresh browser per search)
      await browser?.close().catch(() => {})
      browser = null
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
      // Always close browser if not already closed
      if (browser) {
        try {
          await browser.close()
        } catch {
          // Browser may already be closed
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
