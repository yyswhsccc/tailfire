/**
 * OTA Trip Requests Controller
 *
 * REST endpoints for the OTA trip request pipeline. Consumers build
 * multi-component trip requests (flights, cruises, hotels, tours) which
 * progress through: draft → submitted → promoted.
 *
 * Auth: @Public (bypass JWT) + OtaServiceKeyGuard (x-ota-service-key header).
 */

import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { OtaTripRequestsService } from './ota-trip-requests.service'
import { TripPromotionService } from './trip-promotion.service'
import { CreateTripRequestDto, UpdateComponentsDto } from './dto/create-trip-request.dto'

@ApiTags('OTA Trip Requests')
@ApiHeader({
  name: 'x-ota-service-key',
  description: 'OTA service-to-service key',
  required: true,
})
@Controller('ota/trip-requests')
@Public()
@UseGuards(OtaServiceKeyGuard)
export class OtaTripRequestsController {
  private readonly logger = new Logger(OtaTripRequestsController.name)

  constructor(
    private readonly tripRequests: OtaTripRequestsService,
    private readonly promotionService: TripPromotionService,
  ) {}

  /**
   * Create a new trip request (status: draft).
   * POST /ota/trip-requests
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new OTA trip request' })
  @ApiResponse({ status: 201, description: 'Trip request created in draft status' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async create(@Body() dto: CreateTripRequestDto) {
    const request = await this.tripRequests.create(dto)
    return { requestId: request.id }
  }

  /**
   * Update components on a draft trip request.
   * PUT /ota/trip-requests/:id/components
   */
  @Put(':id/components')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update components on a draft trip request' })
  @ApiResponse({ status: 200, description: 'Components updated' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async updateComponents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComponentsDto,
  ) {
    const request = await this.tripRequests.updateComponents(id, dto)
    const components = request.components as any[]
    return { requestId: request.id, componentCount: components.length }
  }

  /**
   * Submit a trip request and trigger promotion into a full Tailfire trip.
   * POST /ota/trip-requests/:id/submit
   *
   * 1. Transitions draft → submitted
   * 2. Runs the promotion pipeline inline
   * 3. Returns success even if promotion fails (the request was submitted)
   */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a trip request and trigger promotion' })
  @ApiResponse({ status: 200, description: 'Trip request submitted (promotion may be async)' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status or has no components' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async submit(@Param('id', ParseUUIDPipe) id: string) {
    // Step 1: Transition draft → submitted
    await this.tripRequests.submit(id)

    // Step 2: Run promotion pipeline inline
    let tripId: string | undefined
    let message = 'Trip request submitted and promoted successfully'

    try {
      tripId = await this.promotionService.promote(id)
    } catch (error) {
      // Promotion failed, but the request was still submitted successfully
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Promotion failed for trip request ${id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      )
      message = 'Trip request submitted but promotion encountered an error'
    }

    return { requestId: id, tripId, message }
  }

  /**
   * Get trip request details.
   * GET /ota/trip-requests/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip request details' })
  @ApiResponse({ status: 200, description: 'Trip request details' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripRequests.findById(id)
  }
}
