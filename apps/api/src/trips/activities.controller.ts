/**
 * Activities Controller
 *
 * REST API endpoints for activity management.
 * Includes both day-scoped activities and type-specific activity operations.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
  UsePipes,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { ActivitiesService } from './activities.service'
import { ActivityTravelersService, LinkTravelersDto, ActivityTravelerDto } from './activity-travelers.service'
import { getActorId } from '../common/decorators/actor.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { zodValidation } from '../common/pipes'
import { ComponentOrchestrationService } from './component-orchestration.service'
import {
  createActivityDtoSchema,
  updateActivityDtoSchema,
  // Component request schemas for validation
  createFlightComponentDtoSchema,
  updateFlightComponentDtoSchema,
  createLodgingComponentDtoSchema,
  updateLodgingComponentDtoSchema,
  createTransportationComponentDtoSchema,
  updateTransportationComponentDtoSchema,
  createDiningComponentDtoSchema,
  updateDiningComponentDtoSchema,
  createPortInfoComponentDtoSchema,
  updatePortInfoComponentDtoSchema,
  createOptionsComponentDtoSchema,
  updateOptionsComponentDtoSchema,
  createCustomCruiseComponentDtoSchema,
  updateCustomCruiseComponentDtoSchema,
  createCustomTourComponentDtoSchema,
  updateCustomTourComponentDtoSchema,
  createTourDayComponentDtoSchema,
  updateTourDayComponentDtoSchema,
} from '@tailfire/shared-types'
import type {
  ActivityResponseDto,
  CreateActivityDto,
  UpdateActivityDto,
  ReorderActivitiesDto,
  MoveActivityDto,
  ActivityFilterDto,
  PackageResponseDto,
  LinkActivitiesToPackageDto,
  PackageLinkedActivityDto,
  CreateFlightComponentDto,
  FlightComponentDto,
  UpdateFlightComponentDto,
  CreateLodgingComponentDto,
  LodgingComponentDto,
  UpdateLodgingComponentDto,
  CreateTransportationComponentDto,
  TransportationComponentDto,
  UpdateTransportationComponentDto,
  CreateDiningComponentDto,
  DiningComponentDto,
  UpdateDiningComponentDto,
  CreatePortInfoComponentDto,
  PortInfoComponentDto,
  UpdatePortInfoComponentDto,
  CreateOptionsComponentDto,
  OptionsComponentDto,
  UpdateOptionsComponentDto,
  CreateCustomCruiseComponentDto,
  CustomCruiseComponentDto,
  UpdateCustomCruiseComponentDto,
  CreateCustomTourComponentDto,
  CustomTourComponentDto,
  UpdateCustomTourComponentDto,
  CreateTourDayComponentDto,
  TourDayComponentDto,
  UpdateTourDayComponentDto,
} from '@tailfire/shared-types'

@ApiTags('Activities')
@Controller('days/:dayId/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  /**
   * Get all activities for a day
   * GET /days/:dayId/activities
   */
  @Get()
  async findByDay(
    @GetAuthContext() auth: AuthContext,
    @Param('dayId') dayId: string,
  ): Promise<ActivityResponseDto[]> {
    await this.activitiesService.verifyTripAccessFromDayId(dayId, auth)
    return this.activitiesService.findByDay(dayId)
  }

  /**
   * Reorder activities within a day (drag-and-drop)
   * POST /days/:dayId/activities/reorder
   */
  @HttpCode(HttpStatus.OK)
  @Post('reorder')
  async reorder(
    @GetAuthContext() auth: AuthContext,
    @Param('dayId') dayId: string,
    @Body() dto: ReorderActivitiesDto,
  ): Promise<ActivityResponseDto[]> {
    await this.activitiesService.verifyTripAccessFromDayId(dayId, auth, true)
    return this.activitiesService.reorder(dayId, dto)
  }

  /**
   * Create a new activity
   * POST /days/:dayId/activities
   */
  @Post()
  @UsePipes(zodValidation(createActivityDtoSchema.omit({ itineraryDayId: true })))
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('dayId') dayId: string,
    @Body() dto: Omit<CreateActivityDto, 'itineraryDayId'>,
    @Req() req: Request,
  ): Promise<ActivityResponseDto> {
    await this.activitiesService.verifyTripAccessFromDayId(dayId, auth, true)
    return this.activitiesService.create(
      {
        ...dto,
        itineraryDayId: dayId,
      },
      getActorId(req)
    )
  }

  /**
   * Get a single activity by ID
   * GET /days/:dayId/activities/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ActivityResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.activitiesService.findOne(id)
  }

  /**
   * Update an activity
   * PATCH /days/:dayId/activities/:id
   */
  @Patch(':id')
  @UsePipes(zodValidation(updateActivityDtoSchema))
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @Req() req: Request,
  ): Promise<ActivityResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.activitiesService.update(id, dto, getActorId(req))
  }

  /**
   * Move activity to a different day
   * POST /days/:dayId/activities/:id/move
   */
  @HttpCode(HttpStatus.OK)
  @Post(':id/move')
  async move(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: MoveActivityDto,
  ): Promise<ActivityResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    // Also verify access to target day
    await this.activitiesService.verifyTripAccessFromDayId(dto.targetDayId, auth, true)
    return this.activitiesService.move(id, dto)
  }

  /**
   * Delete an activity
   * DELETE /days/:dayId/activities/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.activitiesService.remove(id, getActorId(req))
  }

  /**
   * Duplicate an activity within the same day
   * POST /days/:dayId/activities/:id/duplicate
   *
   * Creates a copy of the activity with " (Copy)" appended to the name.
   * The new activity is placed at the end of the day's activity list.
   *
   * Validation:
   * - Activity must exist
   * - Activity must belong to the specified dayId (prevents cross-day duplication)
   */
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/duplicate')
  async duplicate(
    @GetAuthContext() auth: AuthContext,
    @Param('dayId') dayId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ActivityResponseDto> {
    await this.activitiesService.verifyTripAccessFromDayId(dayId, auth, true)
    return this.activitiesService.duplicate(dayId, id, getActorId(req))
  }
}

/**
 * Global Activities Controller
 * For querying activities across all days with filters
 * Also handles package-related operations (children, travelers)
 *
 * Access control: All endpoints verify trip access via ActivitiesService.
 */
@ApiTags('Activities')
@Controller('activities')
export class ActivitiesGlobalController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly activityTravelersService: ActivityTravelersService,
  ) {}

  /**
   * Get all activities with optional filtering
   * GET /activities?itineraryDayId=xxx&activityType=lodging&status=confirmed
   *
   * Access check: Requires dayId or tripId filter for access verification.
   * Without a filter, returns empty array (no cross-trip queries allowed).
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: ActivityFilterDto,
  ): Promise<ActivityResponseDto[]> {
    // Require itineraryDayId filter for access control - no cross-trip queries allowed
    if (filters.itineraryDayId) {
      await this.activitiesService.verifyTripAccessFromDayId(filters.itineraryDayId, auth)
    } else {
      // No scope filter provided - return empty to prevent cross-trip data leakage
      return []
    }
    return this.activitiesService.findAll(filters)
  }

  /**
   * Create a new floating activity (no day association)
   * POST /activities
   *
   * Used for creating packages that are not associated with a specific day.
   * Packages can be "floating" and link activities from multiple days.
   *
   * Access check: User must have write access to the trip (via dayId or tripId).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createActivityDtoSchema))
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateActivityDto,
    @Req() req: Request
  ): Promise<ActivityResponseDto | PackageResponseDto> {
    // Verify write access via dayId or tripId
    if (dto.itineraryDayId) {
      await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    } else if (dto.tripId) {
      await this.activitiesService.verifyTripAccessFromTripId(dto.tripId, auth, true)
    } else {
      throw new BadRequestException('Either itineraryDayId or tripId is required')
    }
    // Pass tripId for floating packages that need it for agency resolution
    const result = await this.activitiesService.create(dto, getActorId(req), dto.tripId ?? undefined)
    // For packages, link child activities if provided
    if (dto.activityType === 'package' && dto.activityIds?.length) {
      await this.activitiesService.linkChildrenToPackage(result.id, dto.activityIds)
    }
    // For packages, return full response with all related data
    if (dto.activityType === 'package') {
      return this.activitiesService.findOne(result.id)
    }
    return result
  }

  /**
   * Get a single activity by ID (global endpoint - no day ID required)
   * GET /activities/:id
   *
   * For packages, returns full PackageResponseDto with pricing, details, children, travelers, and totals.
   * For other activity types, returns ActivityResponseDto with pricing.
   *
   * Used by useIsChildOfPackage hook to check if parent activity is a package.
   * This endpoint is necessary because the parent may be a floating package
   * (no itineraryDayId) or on a different day than the child.
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ActivityResponseDto | PackageResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.activitiesService.findOne(id)
  }

  /**
   * Update an activity (global endpoint - no day ID required)
   * PATCH /activities/:id
   *
   * Supports updating any activity including floating packages.
   * For packages, returns full PackageResponseDto.
   */
  @Patch(':id')
  @UsePipes(zodValidation(updateActivityDtoSchema))
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @Req() req: Request,
  ): Promise<ActivityResponseDto | PackageResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    const result = await this.activitiesService.update(id, dto, getActorId(req))
    // For packages, return full response with all related data
    if (result.activityType === 'package') {
      return this.activitiesService.findOne(result.id)
    }
    return result
  }

  /**
   * Delete an activity (global endpoint - no day ID required)
   * DELETE /activities/:id
   *
   * Supports deleting any activity including floating packages.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.activitiesService.remove(id, getActorId(req))
  }

  // ============================================================================
  // Package Children Endpoints
  // ============================================================================

  /**
   * Get all child activities linked to a package
   * GET /activities/:id/children
   */
  @Get(':id/children')
  async getChildren(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PackageLinkedActivityDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.activitiesService.getLinkedActivitiesWithDayInfo(id)
  }

  /**
   * Link activities to a package
   * POST /activities/:id/children
   */
  @Post(':id/children')
  @HttpCode(HttpStatus.OK)
  async linkChildren(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: LinkActivitiesToPackageDto,
  ): Promise<PackageLinkedActivityDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.activitiesService.linkChildrenToPackage(id, dto.activityIds, auth.userId)
    return this.activitiesService.getLinkedActivitiesWithDayInfo(id)
  }

  /**
   * Unlink activities from a package
   * DELETE /activities/:id/children
   */
  @Delete(':id/children')
  @HttpCode(HttpStatus.OK)
  async unlinkChildren(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: LinkActivitiesToPackageDto,
  ): Promise<PackageLinkedActivityDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.activitiesService.unlinkChildrenFromPackage(id, dto.activityIds, auth.userId)
    return this.activitiesService.getLinkedActivitiesWithDayInfo(id)
  }

  // ============================================================================
  // Activity Travelers Endpoints
  // ============================================================================

  /**
   * Get all travelers linked to an activity
   * GET /activities/:id/travelers
   */
  @Get(':id/travelers')
  async getTravelers(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ActivityTravelerDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.activityTravelersService.findByActivityId(id)
  }

  /**
   * Link travelers to an activity
   * POST /activities/:id/travelers
   */
  @Post(':id/travelers')
  @HttpCode(HttpStatus.OK)
  async linkTravelers(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: LinkTravelersDto,
  ): Promise<ActivityTravelerDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.activityTravelersService.linkTravelers(id, dto)
  }

  /**
   * Unlink travelers from an activity
   * DELETE /activities/:id/travelers
   */
  @Delete(':id/travelers')
  @HttpCode(HttpStatus.OK)
  async unlinkTravelers(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: LinkTravelersDto,
  ): Promise<ActivityTravelerDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.activityTravelersService.unlinkTravelers(id, dto.tripTravelerIds)
  }
}

/**
 * Typed Activities Controller
 * Polymorphic REST endpoints for type-specific activity operations.
 * Handles type-safe create/update with activity-specific details.
 *
 * Routes under /activities/* for type-specific operations.
 *
 * Access control: All endpoints verify trip access via ActivitiesService.
 */
@ApiTags('Activities')
@Controller('activities')
export class TypedActivitiesController {
  constructor(
    private readonly orchestrationService: ComponentOrchestrationService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  // ============================================================================
  // Flight Activity Endpoints
  // ============================================================================

  /**
   * Create a new flight activity with details
   * POST /activities/flights
   */
  @Post('flights')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createFlightComponentDtoSchema))
  async createFlight(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateFlightComponentDto,
  ): Promise<FlightComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createFlight(dto)
  }

  /**
   * Get a flight activity with details
   * GET /activities/flights/:id
   */
  @Get('flights/:id')
  async getFlight(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<FlightComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getFlight(id)
  }

  /**
   * Update a flight activity with details
   * PATCH /activities/flights/:id
   */
  @Patch('flights/:id')
  @UsePipes(zodValidation(updateFlightComponentDtoSchema))
  async updateFlight(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateFlightComponentDto
  ): Promise<FlightComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateFlight(id, dto)
  }

  /**
   * Delete a flight activity
   * DELETE /activities/flights/:id
   */
  @Delete('flights/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFlight(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteFlight(id)
  }

  // ============================================================================
  // Lodging Activity Endpoints
  // ============================================================================

  /**
   * Create a new lodging activity with details
   * POST /activities/lodging
   */
  @Post('lodging')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createLodgingComponentDtoSchema))
  async createLodging(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateLodgingComponentDto,
  ): Promise<LodgingComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createLodging(dto)
  }

  /**
   * Get a lodging activity with details
   * GET /activities/lodging/:id
   */
  @Get('lodging/:id')
  async getLodging(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<LodgingComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getLodging(id)
  }

  /**
   * Update a lodging activity with details
   * PATCH /activities/lodging/:id
   */
  @Patch('lodging/:id')
  @UsePipes(zodValidation(updateLodgingComponentDtoSchema))
  async updateLodging(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateLodgingComponentDto
  ): Promise<LodgingComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateLodging(id, dto)
  }

  /**
   * Delete a lodging activity
   * DELETE /activities/lodging/:id
   */
  @Delete('lodging/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLodging(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteLodging(id)
  }

  // ============================================================================
  // Transportation Activity Endpoints
  // ============================================================================

  /**
   * Create a new transportation activity with details
   * POST /activities/transportation
   */
  @Post('transportation')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createTransportationComponentDtoSchema))
  async createTransportation(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateTransportationComponentDto,
  ): Promise<TransportationComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createTransportation(dto)
  }

  /**
   * Get a transportation activity with details
   * GET /activities/transportation/:id
   */
  @Get('transportation/:id')
  async getTransportation(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TransportationComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getTransportation(id)
  }

  /**
   * Update a transportation activity with details
   * PATCH /activities/transportation/:id
   */
  @Patch('transportation/:id')
  @UsePipes(zodValidation(updateTransportationComponentDtoSchema))
  async updateTransportation(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransportationComponentDto
  ): Promise<TransportationComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateTransportation(id, dto)
  }

  /**
   * Delete a transportation activity
   * DELETE /activities/transportation/:id
   */
  @Delete('transportation/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransportation(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteTransportation(id)
  }

  // ============================================================================
  // Dining Activity Endpoints
  // ============================================================================

  /**
   * Create a new dining activity with details
   * POST /activities/dining
   */
  @Post('dining')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createDiningComponentDtoSchema))
  async createDining(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateDiningComponentDto,
  ): Promise<DiningComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createDining(dto)
  }

  /**
   * Get a dining activity with details
   * GET /activities/dining/:id
   */
  @Get('dining/:id')
  async getDining(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<DiningComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getDining(id)
  }

  /**
   * Update a dining activity with details
   * PATCH /activities/dining/:id
   */
  @Patch('dining/:id')
  @UsePipes(zodValidation(updateDiningComponentDtoSchema))
  async updateDining(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateDiningComponentDto
  ): Promise<DiningComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateDining(id, dto)
  }

  /**
   * Delete a dining activity
   * DELETE /activities/dining/:id
   */
  @Delete('dining/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDining(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteDining(id)
  }

  // ============================================================================
  // Port Info Activity Endpoints
  // ============================================================================

  /**
   * Create a new port info activity with details
   * POST /activities/port-info
   */
  @Post('port-info')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createPortInfoComponentDtoSchema))
  async createPortInfo(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreatePortInfoComponentDto,
  ): Promise<PortInfoComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createPortInfo(dto)
  }

  /**
   * Get a port info activity with details
   * GET /activities/port-info/:id
   */
  @Get('port-info/:id')
  async getPortInfo(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PortInfoComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getPortInfo(id)
  }

  /**
   * Update a port info activity with details
   * PATCH /activities/port-info/:id
   */
  @Patch('port-info/:id')
  @UsePipes(zodValidation(updatePortInfoComponentDtoSchema))
  async updatePortInfo(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePortInfoComponentDto
  ): Promise<PortInfoComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updatePortInfo(id, dto)
  }

  /**
   * Delete a port info activity
   * DELETE /activities/port-info/:id
   */
  @Delete('port-info/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePortInfo(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deletePortInfo(id)
  }

  // ============================================================================
  // Options Activity Endpoints
  // ============================================================================

  /**
   * Create a new options activity with details
   * POST /activities/options
   */
  @Post('options')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createOptionsComponentDtoSchema))
  async createOptions(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateOptionsComponentDto,
  ): Promise<OptionsComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createOptions(dto)
  }

  /**
   * Get an options activity with details
   * GET /activities/options/:id
   */
  @Get('options/:id')
  async getOptions(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<OptionsComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getOptions(id)
  }

  /**
   * Update an options activity with details and booking info
   * PATCH /activities/options/:id
   */
  @Patch('options/:id')
  @UsePipes(zodValidation(updateOptionsComponentDtoSchema))
  async updateOptions(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateOptionsComponentDto
  ): Promise<OptionsComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateOptions(id, dto)
  }

  /**
   * Delete an options activity
   * DELETE /activities/options/:id
   */
  @Delete('options/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOptions(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteOptions(id)
  }

  // ============================================================================
  // Custom Cruise Activity Endpoints
  // ============================================================================

  /**
   * Create a new custom cruise activity with details
   * POST /activities/custom-cruise
   */
  @Post('custom-cruise')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createCustomCruiseComponentDtoSchema))
  async createCustomCruise(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateCustomCruiseComponentDto,
  ): Promise<CustomCruiseComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createCustomCruise(dto)
  }

  /**
   * Get a custom cruise activity with details
   * GET /activities/custom-cruise/:id
   */
  @Get('custom-cruise/:id')
  async getCustomCruise(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<CustomCruiseComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getCustomCruise(id)
  }

  /**
   * Update a custom cruise activity with details and booking info
   * PATCH /activities/custom-cruise/:id
   */
  @Patch('custom-cruise/:id')
  @UsePipes(zodValidation(updateCustomCruiseComponentDtoSchema))
  async updateCustomCruise(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomCruiseComponentDto
  ): Promise<CustomCruiseComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateCustomCruise(id, dto)
  }

  /**
   * Delete a custom cruise activity
   * DELETE /activities/custom-cruise/:id
   */
  @Delete('custom-cruise/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomCruise(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteCustomCruise(id)
  }

  /**
   * Create Port Info activities from a cruise's port calls
   * POST /activities/custom-cruise/:id/create-port-entries
   */
  @Post('custom-cruise/:id/create-port-entries')
  async createPortEntriesFromCruise(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<{ created: string[]; skipped: number }> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.createPortEntriesFromCruise(id)
  }

  /**
   * Generate port schedule from cruise dates
   * Auto-creates port_info activities for each day of the cruise
   * POST /activities/custom-cruise/:id/generate-port-schedule
   *
   * Optionally accepts cruise data in the body to avoid re-fetching (performance optimization).
   * If body is provided with itineraryId and customCruiseDetails, uses that data directly.
   *
   * Security: The service layer validates that the provided itineraryId matches the actual
   * cruise ownership to prevent unauthorized data manipulation.
   *
   * NOTE: Input validation is done inline here. Consider migrating to class-validator
   * DTO decorators for consistency with other endpoints when refactoring.
   */
  @Post('custom-cruise/:id/generate-port-schedule')
  async generateCruisePortSchedule(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body?: {
      itineraryId?: string
      customCruiseDetails?: {
        departureDate: string
        arrivalDate: string
        portCallsJson?: any[]
        departurePort?: string | null
        arrivalPort?: string | null
      }
      /** Skip deleting existing port activities (for newly created cruises) */
      skipDelete?: boolean
      /** Auto-extend itinerary dates to fit the cruise (instead of throwing an error) */
      autoExtendItinerary?: boolean
    }
  ): Promise<{ created: PortInfoComponentDto[]; deleted: number }> {
    // Verify write access to this cruise activity
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)

    // Validate input when cruiseData is provided
    if (body?.itineraryId && body?.customCruiseDetails) {
      // Validate UUID format for itineraryId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(body.itineraryId)) {
        throw new BadRequestException('Invalid itineraryId format')
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(body.customCruiseDetails.departureDate)) {
        throw new BadRequestException('Invalid departureDate format (expected YYYY-MM-DD)')
      }
      if (!dateRegex.test(body.customCruiseDetails.arrivalDate)) {
        throw new BadRequestException('Invalid arrivalDate format (expected YYYY-MM-DD)')
      }

      // Validate date ordering
      const departure = new Date(body.customCruiseDetails.departureDate)
      const arrival = new Date(body.customCruiseDetails.arrivalDate)
      if (isNaN(departure.getTime()) || isNaN(arrival.getTime())) {
        throw new BadRequestException('Invalid date value')
      }
      if (arrival < departure) {
        throw new BadRequestException('arrivalDate must be on or after departureDate')
      }

      // Validate portCallsJson is an array if provided
      if (body.customCruiseDetails.portCallsJson !== undefined &&
          !Array.isArray(body.customCruiseDetails.portCallsJson)) {
        throw new BadRequestException('portCallsJson must be an array')
      }
    }

    // If client provides cruise data, pass it to avoid re-fetching (~1000ms+ savings)
    const cruiseData = body?.itineraryId && body?.customCruiseDetails
      ? {
          itineraryId: body.itineraryId,
          customCruiseDetails: body.customCruiseDetails,
          skipDelete: body.skipDelete,
          autoExtendItinerary: body.autoExtendItinerary,
        }
      : undefined
    return this.orchestrationService.generateCruisePortSchedule(id, cruiseData)
  }

  /**
   * Get port schedule for a cruise
   * Returns all port_info activities linked to this cruise
   * GET /activities/custom-cruise/:id/port-schedule
   */
  @Get('custom-cruise/:id/port-schedule')
  async getCruisePortSchedule(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PortInfoComponentDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getCruisePortSchedule(id)
  }

  // ============================================================================
  // Custom Tour Activity Endpoints
  // ============================================================================

  /**
   * Create a new custom tour activity with details
   * POST /activities/custom-tour
   */
  @Post('custom-tour')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createCustomTourComponentDtoSchema))
  async createCustomTour(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateCustomTourComponentDto,
  ): Promise<CustomTourComponentDto> {
    if (!dto.itineraryDayId) {
      throw new BadRequestException('itineraryDayId is required')
    }
    await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    return this.orchestrationService.createCustomTour(dto)
  }

  /**
   * Get a custom tour activity with details
   * GET /activities/custom-tour/:id
   */
  @Get('custom-tour/:id')
  async getCustomTour(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<CustomTourComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getCustomTour(id)
  }

  /**
   * Update a custom tour activity with details
   * PATCH /activities/custom-tour/:id
   */
  @Patch('custom-tour/:id')
  @UsePipes(zodValidation(updateCustomTourComponentDtoSchema))
  async updateCustomTour(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomTourComponentDto,
  ): Promise<CustomTourComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateCustomTour(id, dto)
  }

  /**
   * Delete a custom tour activity
   * DELETE /activities/custom-tour/:id
   */
  @Delete('custom-tour/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomTour(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteCustomTour(id)
  }

  /**
   * Generate tour day schedule from tour details
   * Auto-creates tour_day activities for each day of the tour
   * POST /activities/custom-tour/:id/generate-tour-day-schedule
   *
   * Optionally accepts tour data in the body to avoid re-fetching (performance optimization).
   * If body is provided with itineraryId and customTourDetails, uses that data directly.
   *
   * Security: The service layer validates that the provided itineraryId matches the actual
   * tour ownership to prevent unauthorized data manipulation.
   */
  @Post('custom-tour/:id/generate-tour-day-schedule')
  async generateTourDaySchedule(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body?: {
      itineraryId?: string
      customTourDetails?: {
        tourId?: string
        departureStartDate?: string
        departureEndDate?: string
        days?: number
        itineraryJson?: Array<{
          dayNumber: number
          title?: string
          description?: string
          overnightCity?: string
        }>
      }
      /** Skip deleting existing tour_day activities (for newly created tours) */
      skipDelete?: boolean
      /** Auto-extend itinerary dates to fit the tour (instead of throwing an error) */
      autoExtendItinerary?: boolean
    }
  ): Promise<{ created: TourDayComponentDto[]; deleted: number }> {
    // Verify write access via the custom tour activity
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)

    // Validate input when tourData is provided
    if (body?.itineraryId) {
      // Validate UUID format for itineraryId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(body.itineraryId)) {
        throw new BadRequestException('Invalid itineraryId format')
      }
    }

    // Validate date format if provided
    if (body?.customTourDetails?.departureStartDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(body.customTourDetails.departureStartDate)) {
        throw new BadRequestException('Invalid departureStartDate format (expected YYYY-MM-DD)')
      }
    }

    // Build tourData if body contains sufficient data
    const tourData = body?.itineraryId && body?.customTourDetails
      ? {
          itineraryId: body.itineraryId,
          customTourDetails: body.customTourDetails,
          skipDelete: body.skipDelete,
          autoExtendItinerary: body.autoExtendItinerary,
        }
      : undefined

    return this.orchestrationService.generateTourDaySchedule(id, tourData)
  }

  // ============================================================================
  // Tour Day Activity Endpoints
  // ============================================================================

  /**
   * Create a new tour day activity (child of custom_tour)
   * POST /activities/tour-day
   */
  @Post('tour-day')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createTourDayComponentDtoSchema))
  async createTourDay(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateTourDayComponentDto,
  ): Promise<TourDayComponentDto> {
    // Verify write access via parent activity or day
    if (dto.parentActivityId) {
      await this.activitiesService.verifyTripAccessFromActivityId(dto.parentActivityId, auth, true)
    } else if (dto.itineraryDayId) {
      await this.activitiesService.verifyTripAccessFromDayId(dto.itineraryDayId, auth, true)
    } else {
      throw new BadRequestException('Either parentActivityId or itineraryDayId is required')
    }
    return this.orchestrationService.createTourDay(dto)
  }

  /**
   * Get a tour day activity
   * GET /activities/tour-day/:id
   */
  @Get('tour-day/:id')
  async getTourDay(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TourDayComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth)
    return this.orchestrationService.getTourDay(id)
  }

  /**
   * Update a tour day activity
   * PATCH /activities/tour-day/:id
   */
  @Patch('tour-day/:id')
  @UsePipes(zodValidation(updateTourDayComponentDtoSchema))
  async updateTourDay(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTourDayComponentDto,
  ): Promise<TourDayComponentDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    return this.orchestrationService.updateTourDay(id, dto)
  }

  /**
   * Delete a tour day activity
   * DELETE /activities/tour-day/:id
   */
  @Delete('tour-day/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTourDay(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activitiesService.verifyTripAccessFromActivityId(id, auth, true)
    await this.orchestrationService.deleteTourDay(id)
  }
}
