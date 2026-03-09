/**
 * Trip Group Shares Controller
 *
 * REST API endpoints for trip group sharing.
 * Routes nested under /trips/groups/:groupId/shares
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
import { TripGroupSharesService } from './trip-group-shares.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type { TripGroupShareResponseDto, CreateTripGroupShareDto, UpdateTripGroupShareDto } from '@tailfire/shared-types'

@ApiTags('Trip Group Shares')
@Controller('trips/groups/:groupId/shares')
export class TripGroupSharesController {
  constructor(private readonly tripGroupSharesService: TripGroupSharesService) {}

  /**
   * Share a group with another user
   * POST /trips/groups/:groupId/shares
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() dto: CreateTripGroupShareDto,
  ): Promise<TripGroupShareResponseDto> {
    return this.tripGroupSharesService.create(groupId, dto, auth)
  }

  /**
   * List all shares for a group
   * GET /trips/groups/:groupId/shares
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ): Promise<TripGroupShareResponseDto[]> {
    return this.tripGroupSharesService.findAll(groupId, auth)
  }

  /**
   * Update a share's access level
   * PATCH /trips/groups/:groupId/shares/:userId
   */
  @Patch(':userId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTripGroupShareDto,
  ): Promise<TripGroupShareResponseDto> {
    return this.tripGroupSharesService.update(groupId, userId, dto, auth)
  }

  /**
   * Revoke a share
   * DELETE /trips/groups/:groupId/shares/:userId
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.tripGroupSharesService.remove(groupId, userId, auth)
  }
}
