/**
 * Trip Shares Controller
 *
 * REST API endpoints for trip sharing.
 * NOTE: Separate from trip_collaborators which is for commission splits.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TripSharesService } from './trip-shares.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type { TripShareResponseDto } from '../../../../packages/shared-types/src/api'
import { CreateTripShareDto, UpdateTripShareDto } from './dto'

@ApiTags('Trip Shares')
@Controller('trips/:tripId/shares')
export class TripSharesController {
  constructor(private readonly tripSharesService: TripSharesService) {}

  /**
   * Share a trip with another user
   * POST /trips/:tripId/shares
   * Only the trip owner or admin can share
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripShareDto,
  ): Promise<TripShareResponseDto> {
    return this.tripSharesService.create(tripId, dto, auth)
  }

  /**
   * List all shares for a trip
   * GET /trips/:tripId/shares
   * Only the trip owner or admin can view
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ): Promise<TripShareResponseDto[]> {
    return this.tripSharesService.findAll(tripId, auth)
  }

  /**
   * Update a share's access level
   * PATCH /trips/:tripId/shares/:userId
   * Only the trip owner or admin can update
   */
  @Patch(':userId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTripShareDto,
  ): Promise<TripShareResponseDto> {
    return this.tripSharesService.update(tripId, userId, dto, auth)
  }

  /**
   * Revoke a share
   * DELETE /trips/:tripId/shares/:userId
   * Only the trip owner or admin can revoke
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.tripSharesService.remove(tripId, userId, auth)
  }
}
