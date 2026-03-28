/**
 * Cruise Repository Controller
 *
 * API endpoints for browsing cruise sailings.
 * Supports tiered authentication:
 * - JWT auth (admin/client portal) - no rate limiting
 * - API key auth (OTA public) - aggressive rate limiting
 */

import { Controller, Get, Query, Param, ParseUUIDPipe, ParseIntPipe, DefaultValuePipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiHeader, ApiSecurity } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { CatalogAuthGuard, CatalogThrottleGuard } from '../common/guards'
import { CruiseRepositoryService } from './cruise-repository.service'
import {
  SailingSearchDto,
  SailingSearchResponseDto,
  SailingFiltersResponseDto,
} from './dto/sailing-search.dto'
import {
  SailingDetailResponseDto,
  ShipImagesResponseDto,
  ShipDecksResponseDto,
  AlternateSailingsResponseDto,
  CabinImagesResponseDto,
} from './dto/sailing-detail.dto'

@ApiTags('Cruise Repository')
@Controller('cruise-repository')
@Public() // Bypass global JWT guard - we use our own hybrid auth
@UseGuards(CatalogAuthGuard, CatalogThrottleGuard)
@ApiSecurity('bearer')
@ApiHeader({
  name: 'x-catalog-api-key',
  description: 'Catalog API key for OTA public access (alternative to JWT)',
  required: false,
})
export class CruiseRepositoryController {
  constructor(private readonly cruiseRepository: CruiseRepositoryService) {}

  // ============================================================================
  // SEARCH
  // ============================================================================

  /**
   * Search sailings with filters and pagination.
   * GET /cruise-repository/sailings
   */
  @Get('sailings')
  @ApiOperation({ summary: 'Search sailings with filters and pagination' })
  @ApiResponse({ status: 200, type: SailingSearchResponseDto })
  async searchSailings(@Query() dto: SailingSearchDto): Promise<SailingSearchResponseDto> {
    return this.cruiseRepository.searchSailings(dto)
  }

  // ============================================================================
  // FILTER OPTIONS
  // ============================================================================

  /**
   * Get available filter options (cruise lines, ships, regions, ports, ranges).
   * Pass current filter values to get dynamic options that adjust based on selections.
   * GET /cruise-repository/filters
   */
  @Get('filters')
  @ApiOperation({ summary: 'Get available filter options for search UI (dynamically filtered)' })
  @ApiResponse({ status: 200, type: SailingFiltersResponseDto })
  async getFilters(@Query() currentFilters?: SailingSearchDto): Promise<SailingFiltersResponseDto> {
    return this.cruiseRepository.getFilterOptions(currentFilters)
  }

  // ============================================================================
  // CRUISE LINES
  // ============================================================================

  /**
   * Get all cruise lines with ship and sailing counts.
   * GET /cruise-repository/lines
   */
  @Get('lines')
  @ApiOperation({ summary: 'List all cruise lines with ship and sailing counts' })
  @ApiResponse({ status: 200, description: 'List of cruise lines' })
  async getLines() {
    return this.cruiseRepository.getLines()
  }

  /**
   * Get a single cruise line by slug.
   * GET /cruise-repository/lines/by-slug/:slug
   */
  @Get('lines/by-slug/:slug')
  @ApiOperation({ summary: 'Get cruise line detail by slug' })
  @ApiParam({ name: 'slug', description: 'Cruise line slug' })
  @ApiResponse({ status: 200, description: 'Cruise line detail' })
  @ApiResponse({ status: 404, description: 'Cruise line not found' })
  async getLineBySlug(@Param('slug') slug: string) {
    return this.cruiseRepository.getLineBySlug(slug)
  }

  /**
   * Get a single cruise line with ships list and upcoming sailing count.
   * GET /cruise-repository/lines/:id
   */
  @Get('lines/:id')
  @ApiOperation({ summary: 'Get cruise line detail with ships' })
  @ApiParam({ name: 'id', description: 'Cruise line UUID' })
  @ApiResponse({ status: 200, description: 'Cruise line detail' })
  @ApiResponse({ status: 404, description: 'Cruise line not found' })
  async getLineDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.cruiseRepository.getLineDetail(id)
  }

  // ============================================================================
  // REGIONS
  // ============================================================================

  /**
   * Get all regions with sailing counts.
   * GET /cruise-repository/regions
   */
  @Get('regions')
  @ApiOperation({ summary: 'List all cruise regions with sailing counts' })
  @ApiResponse({ status: 200, description: 'List of regions' })
  async getRegions() {
    return this.cruiseRepository.getRegions()
  }

  /**
   * Get a single region by slug.
   * GET /cruise-repository/regions/by-slug/:slug
   */
  @Get('regions/by-slug/:slug')
  @ApiOperation({ summary: 'Get region detail by slug' })
  @ApiParam({ name: 'slug', description: 'Region slug' })
  @ApiResponse({ status: 200, description: 'Region detail with destinations' })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async getRegionBySlug(@Param('slug') slug: string) {
    return this.cruiseRepository.getRegionBySlug(slug)
  }

  /**
   * Get a single region with destinations that have sailings through it.
   * GET /cruise-repository/regions/:id
   */
  @Get('regions/:id')
  @ApiOperation({ summary: 'Get region detail with destinations' })
  @ApiParam({ name: 'id', description: 'Region UUID' })
  @ApiResponse({ status: 200, description: 'Region detail with destinations' })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async getRegionDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.cruiseRepository.getRegionDetail(id)
  }

  // ============================================================================
  // SHIPS (listings BEFORE parameterized routes)
  // ============================================================================

  /**
   * Get all ships with image URL, cruise line, and sailing count.
   * Optional filter by cruise line ID.
   * GET /cruise-repository/ships
   */
  @Get('ships')
  @ApiOperation({ summary: 'List all ships with cruise line and sailing counts' })
  @ApiQuery({ name: 'lineId', required: false, description: 'Filter by cruise line UUID' })
  @ApiResponse({ status: 200, description: 'List of ships' })
  async getShips(@Query('lineId') lineId?: string) {
    return this.cruiseRepository.getShips(lineId)
  }

  /**
   * Get a single ship by slug.
   * GET /cruise-repository/ships/by-slug/:slug
   */
  @Get('ships/by-slug/:slug')
  @ApiOperation({ summary: 'Get ship detail by slug' })
  @ApiParam({ name: 'slug', description: 'Ship slug' })
  @ApiResponse({ status: 200, description: 'Ship detail' })
  @ApiResponse({ status: 404, description: 'Ship not found' })
  async getShipBySlug(@Param('slug') slug: string) {
    return this.cruiseRepository.getShipBySlug(slug)
  }

  /**
   * Get a single ship with cruise line and upcoming sailing count.
   * GET /cruise-repository/ships/:id
   */
  @Get('ships/:id')
  @ApiOperation({ summary: 'Get ship detail' })
  @ApiParam({ name: 'id', description: 'Ship UUID' })
  @ApiResponse({ status: 200, description: 'Ship detail' })
  @ApiResponse({ status: 404, description: 'Ship not found' })
  async getShipDetailById(@Param('id', ParseUUIDPipe) id: string) {
    return this.cruiseRepository.getShipDetail(id)
  }

  // ============================================================================
  // SHIP IMAGES (PAGINATED)
  // ============================================================================

  /**
   * Get paginated ship images.
   * GET /cruise-repository/ships/:shipId/images
   */
  @Get('ships/:shipId/images')
  @ApiOperation({ summary: 'Get paginated ship images' })
  @ApiParam({ name: 'shipId', description: 'Ship UUID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page (max: 20, default: 10)' })
  @ApiResponse({ status: 200, type: ShipImagesResponseDto })
  async getShipImages(
    @Param('shipId', ParseUUIDPipe) shipId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number
  ): Promise<ShipImagesResponseDto> {
    return this.cruiseRepository.getShipImages(shipId, page, pageSize)
  }

  // ============================================================================
  // SHIP DECKS (with cabin coordinates for interactive deck plans)
  // ============================================================================

  /**
   * Get ship deck plans with cabin coordinate overlays.
   * GET /cruise-repository/ships/:shipId/decks
   */
  @Get('ships/:shipId/decks')
  @ApiOperation({ summary: 'Get ship decks with cabin coordinates for interactive deck plans' })
  @ApiParam({ name: 'shipId', description: 'Ship UUID' })
  @ApiResponse({ status: 200, type: ShipDecksResponseDto })
  @ApiResponse({ status: 404, description: 'Ship not found' })
  async getShipDecks(
    @Param('shipId', ParseUUIDPipe) shipId: string
  ): Promise<ShipDecksResponseDto> {
    return this.cruiseRepository.getShipDecks(shipId)
  }

  // ============================================================================
  // SAILING BY PUBLIC ID (MUST be before sailings/:id)
  // ============================================================================

  /**
   * Get sailing details by stable public ID (for SEO-friendly URLs).
   * GET /cruise-repository/sailings/by-public-id/:publicId
   */
  @Get('sailings/by-public-id/:publicId')
  @ApiOperation({ summary: 'Get sailing details by public ID (stable URL lookup)' })
  @ApiParam({ name: 'publicId', description: 'Sailing public ID (e.g., "CRU-ABC123")' })
  @ApiResponse({ status: 200, type: SailingDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Sailing not found' })
  async getSailingByPublicId(
    @Param('publicId') publicId: string
  ): Promise<SailingDetailResponseDto> {
    return this.cruiseRepository.getSailingByPublicId(publicId)
  }

  // ============================================================================
  // SAILING DETAIL
  // ============================================================================

  /**
   * Get full sailing details including itinerary and prices.
   * GET /cruise-repository/sailings/:id
   */
  @Get('sailings/:id')
  @ApiOperation({ summary: 'Get sailing details by ID' })
  @ApiParam({ name: 'id', description: 'Sailing UUID' })
  @ApiResponse({ status: 200, type: SailingDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Sailing not found' })
  async getSailingDetail(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<SailingDetailResponseDto> {
    return this.cruiseRepository.getSailingDetail(id)
  }

  // ============================================================================
  // ALTERNATE SAILINGS
  // ============================================================================

  /**
   * Get alternate sailings for a given sailing.
   * GET /cruise-repository/sailings/:id/alternates
   */
  @Get('sailings/:id/alternates')
  @ApiOperation({ summary: 'Get alternate/similar sailings' })
  @ApiParam({ name: 'id', description: 'Sailing UUID' })
  @ApiResponse({ status: 200, type: AlternateSailingsResponseDto })
  @ApiResponse({ status: 404, description: 'Sailing not found' })
  async getAlternateSailings(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<AlternateSailingsResponseDto> {
    return this.cruiseRepository.getAlternateSailings(id)
  }

  // ============================================================================
  // CABIN IMAGES
  // ============================================================================

  /**
   * Get cabin type gallery images.
   * GET /cruise-repository/cabin-types/:id/images
   */
  @Get('cabin-types/:id/images')
  @ApiOperation({ summary: 'Get cabin type gallery images' })
  @ApiParam({ name: 'id', description: 'Cabin type UUID' })
  @ApiResponse({ status: 200, type: CabinImagesResponseDto })
  @ApiResponse({ status: 404, description: 'Cabin type not found' })
  async getCabinImages(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<CabinImagesResponseDto> {
    return this.cruiseRepository.getCabinImages(id)
  }
}
