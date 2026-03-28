/**
 * Deals Controller
 *
 * REST API endpoints for travel deals.
 * Three auth levels:
 * - Public (no auth) — OTA Server Components read published deals
 * - Admin (JWT) — CRUD management
 * - Scraper (internal API key) — bulk upsert from VPS scraper
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { InternalApiKeyGuard } from '../cruise-import/guards/internal-api-key.guard'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { DealsService } from './deals.service'
import { CreateDealDto } from './dto/create-deal.dto'
import { UpdateDealDto } from './dto/update-deal.dto'
import { DealSearchDto } from './dto/deal-search.dto'

@ApiTags('Deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  // ============================================================================
  // PUBLIC ENDPOINTS (no auth — for OTA Server Components)
  // ============================================================================

  /**
   * List published deals with optional filters.
   * GET /deals
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List published deals (public)' })
  @ApiResponse({ status: 200, description: 'Paginated list of published deals' })
  async listPublished(@Query() searchDto: DealSearchDto) {
    return this.dealsService.findPublished(searchDto)
  }

  /**
   * Get a single published deal by slug.
   * GET /deals/by-slug/:slug
   *
   * Note: uses /by-slug/:slug to avoid collision with /deals/:id (UUID param).
   */
  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get a published deal by slug (public)' })
  @ApiParam({ name: 'slug', description: 'Deal URL slug' })
  @ApiResponse({ status: 200, description: 'Deal found' })
  @ApiResponse({ status: 404, description: 'Deal not found or not published' })
  async getBySlug(@Param('slug') slug: string) {
    const deal = await this.dealsService.findBySlug(slug)
    if (!deal) {
      throw new NotFoundException(`Deal with slug "${slug}" not found`)
    }
    return deal
  }

  // ============================================================================
  // ADMIN ENDPOINTS (JWT auth — global guard)
  // ============================================================================

  /**
   * Create a new deal.
   * POST /deals
   */
  @Post()
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a deal (admin)' })
  @ApiResponse({ status: 201, description: 'Deal created' })
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateDealDto,
  ) {
    return this.dealsService.create(dto, auth.agencyId)
  }

  /**
   * Update a deal.
   * PUT /deals/:id
   */
  @Put(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a deal (admin)' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: 200, description: 'Deal updated' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.dealsService.update(id, dto, auth.agencyId)
  }

  /**
   * Delete a deal.
   * DELETE /deals/:id
   */
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a deal (admin)' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: 204, description: 'Deal deleted' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dealsService.delete(id, auth.agencyId)
  }

  // ============================================================================
  // SCRAPER ENDPOINT (internal API key auth)
  // ============================================================================

  /**
   * Bulk upsert deals from VPS scraper.
   * POST /deals/import
   * Auth: x-internal-api-key header
   */
  @Post('import')
  @Public() // Bypass JWT auth
  @UseGuards(InternalApiKeyGuard) // Require internal API key instead
  @ApiOperation({ summary: 'Import/upsert deals from scraper (internal API key)' })
  @ApiHeader({
    name: 'x-internal-api-key',
    description: 'Internal API key for scraper operations',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Import results' })
  async importDeals(
    @Body() body: { deals: CreateDealDto[]; agencyId: string },
  ) {
    return this.dealsService.upsertFromScraper(body.deals, body.agencyId)
  }
}
