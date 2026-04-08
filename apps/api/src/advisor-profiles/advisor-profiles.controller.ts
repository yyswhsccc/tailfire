/**
 * Advisor Profiles Controller
 *
 * REST API endpoints for advisor profiles.
 * Two auth levels:
 * - Public (no auth) — OTA Server Components read published profiles, deals, trips
 * - Admin (JWT) — CRUD management, TLN sync, featured deals
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
  NotFoundException,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiHeader } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { InternalApiKeyGuard } from '../cruise-import/guards/internal-api-key.guard'
import { AdvisorProfilesService } from './advisor-profiles.service'
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto'
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto'

@ApiTags('Advisor Profiles')
@Controller('advisor-profiles')
export class AdvisorProfilesController {
  constructor(private readonly advisorProfilesService: AdvisorProfilesService) {}

  // ============================================================================
  // PUBLIC ENDPOINTS (no auth — for OTA Server Components)
  // ============================================================================

  /**
   * List published advisor profiles with optional filters.
   * GET /advisor-profiles
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List published advisor profiles (public)' })
  @ApiQuery({ name: 'specialty', required: false, description: 'Filter by specialty' })
  @ApiQuery({ name: 'language', required: false, description: 'Filter by language' })
  @ApiQuery({ name: 'destination', required: false, description: 'Filter by destination' })
  @ApiResponse({ status: 200, description: 'List of published advisor profiles' })
  async listPublished(
    @Query('specialty') specialty?: string,
    @Query('language') language?: string,
    @Query('destination') destination?: string,
  ) {
    return this.advisorProfilesService.findPublished({ specialty, language, destination })
  }

  /**
   * Get a single published advisor profile by slug.
   * GET /advisor-profiles/by-slug/:slug
   */
  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get a published advisor profile by slug (public)' })
  @ApiParam({ name: 'slug', description: 'Advisor profile URL slug' })
  @ApiResponse({ status: 200, description: 'Advisor profile found' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found or not published' })
  async getBySlug(@Param('slug') slug: string) {
    const profile = await this.advisorProfilesService.findBySlug(slug)
    if (!profile) {
      throw new NotFoundException(`Advisor profile with slug "${slug}" not found`)
    }
    return profile
  }

  /**
   * Get advisor's curated deals.
   * GET /advisor-profiles/by-slug/:slug/deals
   */
  @Get('by-slug/:slug/deals')
  @Public()
  @ApiOperation({ summary: "Get advisor's featured deals (public)" })
  @ApiParam({ name: 'slug', description: 'Advisor profile URL slug' })
  @ApiResponse({ status: 200, description: "Advisor's curated deals" })
  async getAdvisorDeals(@Param('slug') slug: string) {
    return this.advisorProfilesService.getAdvisorDeals(slug)
  }

  /**
   * Get advisor's published trips.
   * GET /advisor-profiles/by-slug/:slug/trips
   */
  @Get('by-slug/:slug/trips')
  @Public()
  @ApiOperation({ summary: "Get advisor's published trips (public)" })
  @ApiParam({ name: 'slug', description: 'Advisor profile URL slug' })
  @ApiResponse({ status: 200, description: "Advisor's published trips" })
  async getAdvisorTrips(@Param('slug') slug: string) {
    return this.advisorProfilesService.getAdvisorTrips(slug)
  }

  // ============================================================================
  // INTERNAL ENDPOINT (API key auth — batch sync)
  // ============================================================================

  /**
   * Sync advisor profiles from user_profiles.
   * Creates an advisor profile for every active user that doesn't already have one.
   * POST /advisor-profiles/sync-from-users
   * Auth: x-internal-api-key header
   */
  @Post('sync-from-users')
  @Public() // Bypass JWT auth
  @UseGuards(InternalApiKeyGuard) // Require internal API key instead
  @ApiOperation({ summary: 'Sync advisor profiles from user profiles (internal API key)' })
  @ApiHeader({
    name: 'x-internal-api-key',
    description: 'Internal API key for batch sync operations',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Sync results with created/skipped counts' })
  async syncFromUsers() {
    return this.advisorProfilesService.syncFromUserProfiles()
  }

  // ============================================================================
  // ADMIN ENDPOINTS (JWT auth — global guard)
  // ============================================================================

  /**
   * Get the advisor profile for the currently authenticated user.
   * GET /advisor-profiles/me
   */
  @Get('me')
  @ApiOperation({ summary: 'Get advisor profile for the current user (admin)' })
  @ApiResponse({ status: 200, description: 'Advisor profile for the current user, or null' })
  async getMyAdvisorProfile(@GetAuthContext() auth: AuthContext) {
    return this.advisorProfilesService.findByUserId(auth.userId)
  }

  /**
   * Create a new advisor profile.
   * POST /advisor-profiles
   */
  @Post()
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an advisor profile (admin)' })
  @ApiResponse({ status: 201, description: 'Advisor profile created' })
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateAdvisorProfileDto,
  ) {
    return this.advisorProfilesService.create(dto, auth.userId, auth.agencyId)
  }

  /**
   * Update an advisor profile.
   * PUT /advisor-profiles/:id
   */
  @Put(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an advisor profile (admin)' })
  @ApiParam({ name: 'id', description: 'Advisor profile UUID' })
  @ApiResponse({ status: 200, description: 'Advisor profile updated' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found' })
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdvisorProfileDto,
  ) {
    return this.advisorProfilesService.update(id, dto, auth.agencyId)
  }

  /**
   * Trigger TLN profile sync.
   * POST /advisor-profiles/:id/sync-tln
   */
  @Post(':id/sync-tln')
  @AdminOnly()
  @ApiOperation({ summary: 'Trigger TLN profile sync (admin)' })
  @ApiParam({ name: 'id', description: 'Advisor profile UUID' })
  @ApiResponse({ status: 200, description: 'TLN sync completed, profile updated' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found or no TLN URL' })
  async syncTln(@Param('id', ParseUUIDPipe) id: string) {
    return this.advisorProfilesService.triggerTlnSync(id)
  }

  /**
   * Set featured deals for an advisor.
   * POST /advisor-profiles/:id/featured-deals
   * Body: { deals: [{ dealId: string, sortOrder: number }] }
   */
  @Post(':id/featured-deals')
  @AdminOnly()
  @ApiOperation({ summary: 'Set featured deals for advisor (admin)' })
  @ApiParam({ name: 'id', description: 'Advisor profile UUID' })
  @ApiResponse({ status: 200, description: 'Featured deals updated' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found' })
  async setFeaturedDeals(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { deals: { dealId: string; sortOrder: number }[] },
  ) {
    await this.advisorProfilesService.setFeaturedDeals(id, body.deals)
    return { message: 'Featured deals updated' }
  }

  /**
   * Delete an advisor profile.
   * DELETE /advisor-profiles/:id
   */
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an advisor profile (admin)' })
  @ApiParam({ name: 'id', description: 'Advisor profile UUID' })
  @ApiResponse({ status: 204, description: 'Advisor profile deleted' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found' })
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.advisorProfilesService.delete(id, auth.agencyId)
  }
}
