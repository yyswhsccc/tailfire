/**
 * Softvoyage Controller
 *
 * REST endpoints for submitting vacation package live searches and polling results.
 * Uses the same hybrid auth pattern as VacationRepositoryController:
 * JWT for admin/agent access, API key for OTA public access.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiHeader, ApiSecurity, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { CatalogAuthGuard, CatalogThrottleGuard } from '../common/guards'
import { SoftvoyageService } from './softvoyage.service'
import { SoftvoyageBrowserPoolService } from './softvoyage-browser-pool.service'
import { VacationLiveSearchDto } from './dto/vacation-live-search.dto'

@ApiTags('Softvoyage Live Pricing')
@Controller('softvoyage')
@Public() // Bypass global JWT guard — we use our own hybrid auth
@UseGuards(CatalogAuthGuard, CatalogThrottleGuard)
@ApiSecurity('bearer')
@ApiHeader({
  name: 'x-catalog-api-key',
  description: 'Catalog API key for OTA public access (alternative to JWT)',
  required: false,
})
export class SoftvoyageController {
  constructor(
    private readonly softvoyageService: SoftvoyageService,
    private readonly browserPool: SoftvoyageBrowserPoolService,
  ) {}

  /**
   * Diagnostic: test browser launch and VCO connectivity.
   */
  @Get('diagnostic')
  async diagnostic() {
    const results: Record<string, string> = {}
    try {
      results.browserPoolEnabled = String(this.browserPool.isEnabled())
      results.chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'

      // Try to acquire a page
      const page = await this.browserPool.acquirePage()
      results.browserLaunched = 'true'

      // Try to navigate to VCO
      await page.goto('https://vco.sax.softvoyage.com/cgi-bin/querypackage.cgi?code_ag=VCO&alias=YAQ&language=en', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      const html = await page.content()
      results.vcoReachable = 'true'
      results.htmlLength = String(html.length)
      results.hasDataDome = String(html.includes('captcha-delivery'))
      results.hasSid = String(/sid=[a-f0-9]{32}/.test(html))

      // If no DataDome, try submitting a search
      if (!html.includes('captcha-delivery')) {
        try {
          // Submit search form via POST
          const formParams = new URLSearchParams({
            code_ag: 'VCO', alias: 'YAQ', language: 'en',
            gateway_dep: 'YOW', dest_dep: '29', date_dep: '20260501',
            duration: '7', nb_adult_forf: '2', nb_rooms: '1',
            all_inclusive: 'Y', price_max: '99999',
          })

          await page.evaluate(
            (params: { url: string; body: string }) => {
              const form = document.createElement('form')
              form.method = 'POST'
              form.action = params.url
              for (const [key, value] of new URLSearchParams(params.body).entries()) {
                const input = document.createElement('input')
                input.type = 'hidden'
                input.name = key
                input.value = value
                form.appendChild(input)
              }
              document.body.appendChild(form)
              form.submit()
            },
            { url: 'https://vco.sax.softvoyage.com/cgi-bin/resultspackage.cgi', body: formParams.toString() },
          )
          results.formSubmitted = 'true'

          // Wait for results
          await page.waitForSelector('table[id^="hotel-"], .no-results, body', { timeout: 20000 })
          const resultsHtml = await page.content()
          results.resultsHtmlLength = String(resultsHtml.length)
          results.resultsHasDataDome = String(resultsHtml.includes('captcha-delivery'))
          const hotelMatches = resultsHtml.match(/id="hotel-/g)
          results.hotelsFound = String(hotelMatches?.length ?? 0)
          results.resultsHasSid = String(/sid=[a-f0-9]{32}/.test(resultsHtml))
          // Check for alternative result selectors
          const resultDivs = resultsHtml.match(/id="result-/g)
          results.resultDivsFound = String(resultDivs?.length ?? 0)
          // Check for AJAX loader pattern
          results.hasAjaxLoader = String(resultsHtml.includes('action=results') || resultsHtml.includes('classExpand'))
          // Capture a snippet around any hotel-related content
          const snippetMatch = resultsHtml.match(/(hotel|resort|result|package).{0,200}/i)
          results.htmlSnippet = snippetMatch ? snippetMatch[0].substring(0, 150) : 'no hotel/result patterns found'
        } catch (searchErr) {
          results.searchError = searchErr instanceof Error ? searchErr.message : String(searchErr)
        }
      }

      await this.browserPool.releasePage(page)
      results.pageReleased = 'true'
    } catch (err) {
      results.error = err instanceof Error ? err.message : String(err)
      results.stack = err instanceof Error ? (err.stack?.split('\n').slice(0, 3).join(' | ') ?? '') : ''
    }
    return results
  }

  /**
   * Submit a vacation package live search.
   * Returns cached results immediately (200) or a jobId for polling (202).
   */
  @Post('search')
  @ApiResponse({ status: 200, description: 'Cached results returned immediately' })
  @ApiResponse({ status: 202, description: 'Search queued — poll with jobId' })
  async submitSearch(
    @Body() dto: VacationLiveSearchDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.softvoyageService.submitSearch(dto)

    if (result.cached) {
      res.status(HttpStatus.OK)
      return {
        cached: true,
        results: result.results,
        fetchedAt: result.fetchedAt,
      }
    }

    res.status(HttpStatus.ACCEPTED)
    return {
      cached: false,
      jobId: result.jobId,
      pollUrl: `/softvoyage/search/${result.jobId}`,
    }
  }

  /**
   * Poll for vacation search results by jobId.
   */
  @Get('search/:jobId')
  @ApiResponse({ status: 200, description: 'Search completed or failed' })
  @ApiResponse({ status: 202, description: 'Search still processing' })
  async getSearchResults(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.softvoyageService.getSearchResults(jobId)

    if (result.status === 'completed') {
      res.status(HttpStatus.OK)
      return {
        status: 'completed',
        results: result.results,
        fetchedAt: result.fetchedAt,
      }
    }

    if (result.status === 'processing') {
      res.status(HttpStatus.ACCEPTED)
      return { status: 'processing' }
    }

    res.status(HttpStatus.OK)
    return { status: 'failed' }
  }
}
