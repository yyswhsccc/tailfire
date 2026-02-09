/**
 * Traveler Groups Controller
 *
 * REST API endpoints for traveler group management.
 *
 * Access control: All endpoints verify trip access via TripAccessService.
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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TravelerGroupsService } from './traveler-groups.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import {
  CreateTravelerGroupDto,
  UpdateTravelerGroupDto,
  TravelerGroupFilterDto,
  AddTravelerToGroupDto,
  UpdateTravelerGroupMemberDto,
} from './dto'
import type {
  TravelerGroupResponseDto,
  TravelerGroupWithMembersResponseDto,
  TravelerGroupMemberResponseDto,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Traveler Groups')
@Controller('trips/:tripId/traveler-groups')
export class TravelerGroupsController {
  constructor(
    private readonly travelerGroupsService: TravelerGroupsService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Create a new traveler group
   * POST /trips/:tripId/traveler-groups
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() createTravelerGroupDto: CreateTravelerGroupDto,
  ): Promise<TravelerGroupResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.create(tripId, createTravelerGroupDto)
  }

  /**
   * Get all traveler groups (optionally filtered)
   * GET /trips/:tripId/traveler-groups
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Query() filters: TravelerGroupFilterDto,
  ): Promise<TravelerGroupResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    // Merge tripId from route param with query filters
    return this.travelerGroupsService.findAll({ ...filters, tripId })
  }

  /**
   * Get a single traveler group by ID
   * GET /trips/:tripId/traveler-groups/:id
   * Validates the group belongs to the specified trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<TravelerGroupResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.travelerGroupsService.findOne(id, tripId)
  }

  /**
   * Get a traveler group with all its members
   * GET /trips/:tripId/traveler-groups/:id/members
   * Validates the group belongs to the specified trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id/members')
  async findOneWithMembers(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<TravelerGroupWithMembersResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.travelerGroupsService.findOneWithMembers(id, tripId)
  }

  /**
   * Update a traveler group
   * PATCH /trips/:tripId/traveler-groups/:id
   * Validates the group belongs to the specified trip
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() updateTravelerGroupDto: UpdateTravelerGroupDto,
  ): Promise<TravelerGroupResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.update(id, updateTravelerGroupDto, tripId)
  }

  /**
   * Delete a traveler group
   * DELETE /trips/:tripId/traveler-groups/:id
   * Validates the group belongs to the specified trip
   *
   * Access check: User must have write access to the trip.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.remove(id, tripId)
  }

  /**
   * Add a traveler to a group
   * POST /trips/:tripId/traveler-groups/:groupId/members
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':groupId/members')
  async addMember(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('groupId') groupId: string,
    @Body() addTravelerToGroupDto: AddTravelerToGroupDto,
  ): Promise<TravelerGroupMemberResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.addMember(groupId, addTravelerToGroupDto)
  }

  /**
   * Update a group member
   * PATCH /trips/:tripId/traveler-groups/:groupId/members/:memberId
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':groupId/members/:memberId')
  async updateMember(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
    @Body() updateTravelerGroupMemberDto: UpdateTravelerGroupMemberDto,
  ): Promise<TravelerGroupMemberResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.updateMember(memberId, updateTravelerGroupMemberDto)
  }

  /**
   * Remove a traveler from a group
   * DELETE /trips/:tripId/traveler-groups/:groupId/members/:memberId
   *
   * Access check: User must have write access to the trip.
   */
  @Delete(':groupId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.travelerGroupsService.removeMember(memberId)
  }
}
