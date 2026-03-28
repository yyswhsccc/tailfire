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
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiHeader, ApiSecurity, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { CatalogAuthGuard, CatalogThrottleGuard } from '../common/guards'
import { SoftvoyageService } from './softvoyage.service'
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
  constructor(private readonly softvoyageService: SoftvoyageService) {}

  /**
   * Submit a vacation package live search.
   * Returns cached results immediately (200) or a jobId for polling (202).
   */
  @Post('search')
  @HttpCode(HttpStatus.OK) // Default; overridden to 202 when queued
  @ApiResponse({ status: 200, description: 'Cached results returned immediately' })
  @ApiResponse({ status: 202, description: 'Search queued — poll with jobId' })
  async submitSearch(
    @Body() dto: VacationLiveSearchDto,
  ) {
    const result = await this.softvoyageService.submitSearch(dto)

    if (result.cached) {
      return {
        cached: true,
        results: result.results,
        fetchedAt: new Date().toISOString(),
      }
    }

    // Return 202 Accepted for queued searches
    // NestJS doesn't support dynamic status codes natively from @HttpCode,
    // so we embed the status hint in the response body for the client.
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
  async getSearchResults(@Param('jobId') jobId: string) {
    const result = await this.softvoyageService.getSearchResults(jobId)

    if (result.status === 'completed') {
      return {
        status: 'completed',
        results: result.results,
        fetchedAt: new Date().toISOString(),
      }
    }

    if (result.status === 'processing') {
      return { status: 'processing' }
    }

    return { status: 'failed' }
  }
}
