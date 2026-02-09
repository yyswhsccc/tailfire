/**
 * Insurance Controller
 *
 * REST API endpoints for trip insurance packages and per-traveler insurance tracking.
 * Nested under /trips/:tripId/insurance/*
 *
 * Access control: All endpoints verify trip access via TripAccessService.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { InsuranceService } from './insurance.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripInsurancePackageDto,
  CreateTripInsurancePackageDto,
  UpdateTripInsurancePackageDto,
  TripInsurancePackagesListDto,
  TripTravelerInsuranceDto,
  CreateTripTravelerInsuranceDto,
  UpdateTripTravelerInsuranceDto,
  TripTravelersInsuranceListDto,
} from '@tailfire/shared-types'

@ApiTags('Insurance')
@Controller('trips/:tripId/insurance')
export class InsuranceController {
  constructor(
    private readonly insuranceService: InsuranceService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  // ============================================================================
  // Insurance Packages
  // ============================================================================

  /**
   * GET /trips/:tripId/insurance/packages
   * List all insurance packages for a trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get('packages')
  async getPackages(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripInsurancePackagesListDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.insuranceService.getPackages(tripId)
  }

  /**
   * POST /trips/:tripId/insurance/packages
   * Create a new insurance package
   *
   * Access check: User must have write access to the trip.
   */
  @Post('packages')
  async createPackage(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripInsurancePackageDto
  ): Promise<TripInsurancePackageDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.createPackage(tripId, dto)
  }

  /**
   * GET /trips/:tripId/insurance/packages/:packageId
   * Get a single insurance package
   *
   * Access check: User must have read access to the trip.
   */
  @Get('packages/:packageId')
  async getPackage(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('packageId') packageId: string
  ): Promise<TripInsurancePackageDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.insuranceService.getPackage(tripId, packageId)
  }

  /**
   * PATCH /trips/:tripId/insurance/packages/:packageId
   * Update an insurance package
   *
   * Access check: User must have write access to the trip.
   */
  @Patch('packages/:packageId')
  async updatePackage(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('packageId') packageId: string,
    @Body() dto: UpdateTripInsurancePackageDto
  ): Promise<TripInsurancePackageDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.updatePackage(tripId, packageId, dto)
  }

  /**
   * DELETE /trips/:tripId/insurance/packages/:packageId
   * Delete an insurance package
   *
   * Access check: User must have write access to the trip.
   */
  @Delete('packages/:packageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePackage(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('packageId') packageId: string
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.deletePackage(tripId, packageId)
  }

  // ============================================================================
  // Traveler Insurance
  // ============================================================================

  /**
   * GET /trips/:tripId/insurance/travelers
   * List all traveler insurance records for a trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get('travelers')
  async getTravelerInsurance(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripTravelersInsuranceListDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.insuranceService.getTravelerInsurance(tripId)
  }

  /**
   * POST /trips/:tripId/insurance/travelers
   * Create a traveler insurance record
   *
   * Access check: User must have write access to the trip.
   */
  @Post('travelers')
  async createTravelerInsurance(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripTravelerInsuranceDto
  ): Promise<TripTravelerInsuranceDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.createTravelerInsurance(tripId, dto)
  }

  /**
   * GET /trips/:tripId/insurance/travelers/:insuranceId
   * Get a single traveler insurance record
   *
   * Access check: User must have read access to the trip.
   */
  @Get('travelers/:insuranceId')
  async getTravelerInsuranceById(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('insuranceId') insuranceId: string
  ): Promise<TripTravelerInsuranceDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.insuranceService.getTravelerInsuranceById(tripId, insuranceId)
  }

  /**
   * PATCH /trips/:tripId/insurance/travelers/:insuranceId
   * Update a traveler insurance record
   *
   * Access check: User must have write access to the trip.
   */
  @Patch('travelers/:insuranceId')
  async updateTravelerInsurance(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('insuranceId') insuranceId: string,
    @Body() dto: UpdateTripTravelerInsuranceDto
  ): Promise<TripTravelerInsuranceDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.updateTravelerInsurance(tripId, insuranceId, dto)
  }

  /**
   * DELETE /trips/:tripId/insurance/travelers/:insuranceId
   * Delete a traveler insurance record
   *
   * Access check: User must have write access to the trip.
   */
  @Delete('travelers/:insuranceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTravelerInsurance(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('insuranceId') insuranceId: string
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.insuranceService.deleteTravelerInsurance(tripId, insuranceId)
  }
}
