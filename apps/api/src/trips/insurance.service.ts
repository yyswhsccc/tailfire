/**
 * Insurance Service
 *
 * Business logic for trip insurance packages and per-traveler insurance tracking.
 * Handles compliance states: pending, has_own_insurance, declined, selected_package
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
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

@Injectable()
export class InsuranceService {
  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // Insurance Packages
  // ============================================================================

  /**
   * Get all insurance packages for a trip
   */
  async getPackages(tripId: string): Promise<TripInsurancePackagesListDto> {
    await this.verifyTripExists(tripId)

    const packages = await this.db.client
      .select()
      .from(this.db.schema.tripInsurancePackages)
      .where(eq(this.db.schema.tripInsurancePackages.tripId, tripId))
      .orderBy(this.db.schema.tripInsurancePackages.displayOrder)

    return {
      tripId,
      packages: packages.map(this.formatPackage),
    }
  }

  /**
   * Get a single insurance package
   */
  async getPackage(tripId: string, packageId: string): Promise<TripInsurancePackageDto> {
    await this.verifyTripExists(tripId)

    const [pkg] = await this.db.client
      .select()
      .from(this.db.schema.tripInsurancePackages)
      .where(
        and(
          eq(this.db.schema.tripInsurancePackages.id, packageId),
          eq(this.db.schema.tripInsurancePackages.tripId, tripId)
        )
      )
      .limit(1)

    if (!pkg) {
      throw new NotFoundException(`Insurance package ${packageId} not found`)
    }

    return this.formatPackage(pkg)
  }

  /**
   * Create a new insurance package for a trip
   */
  async createPackage(tripId: string, dto: CreateTripInsurancePackageDto): Promise<TripInsurancePackageDto> {
    await this.verifyTripExists(tripId)

    // Validate activityId if provided
    if (dto.activityId) {
      await this.verifyActivityForInsurance(dto.activityId, tripId)
    }

    const [pkg] = await this.db.client
      .insert(this.db.schema.tripInsurancePackages)
      .values({
        tripId,
        providerName: dto.providerName,
        packageName: dto.packageName,
        policyType: dto.policyType as any,
        coverageAmountCents: dto.coverageAmountCents ?? null,
        premiumCents: dto.premiumCents,
        deductibleCents: dto.deductibleCents ?? null,
        currency: dto.currency || 'CAD',
        coverageStartDate: dto.coverageStartDate ?? null,
        coverageEndDate: dto.coverageEndDate ?? null,
        coverageDetails: dto.coverageDetails ?? null,
        termsUrl: dto.termsUrl ?? null,
        activityId: dto.activityId ?? null,
        isFromCatalog: dto.isFromCatalog ?? false,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      })
      .returning()

    return this.formatPackage(pkg)
  }

  /**
   * Update an insurance package
   */
  async updatePackage(
    tripId: string,
    packageId: string,
    dto: UpdateTripInsurancePackageDto
  ): Promise<TripInsurancePackageDto> {
    await this.getPackage(tripId, packageId) // Verify exists

    // Validate activityId if provided
    if (dto.activityId) {
      await this.verifyActivityForInsurance(dto.activityId, tripId)
    }

    const [pkg] = await this.db.client
      .update(this.db.schema.tripInsurancePackages)
      .set({
        ...dto,
        policyType: dto.policyType as any,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.tripInsurancePackages.id, packageId))
      .returning()

    return this.formatPackage(pkg)
  }

  /**
   * Delete an insurance package
   */
  async deletePackage(tripId: string, packageId: string): Promise<void> {
    await this.getPackage(tripId, packageId) // Verify exists

    await this.db.client
      .delete(this.db.schema.tripInsurancePackages)
      .where(eq(this.db.schema.tripInsurancePackages.id, packageId))
  }

  // ============================================================================
  // Traveler Insurance
  // ============================================================================

  /**
   * Get all traveler insurance records for a trip
   */
  async getTravelerInsurance(tripId: string): Promise<TripTravelersInsuranceListDto> {
    await this.verifyTripExists(tripId)

    const records = await this.db.client
      .select()
      .from(this.db.schema.tripTravelerInsurance)
      .where(eq(this.db.schema.tripTravelerInsurance.tripId, tripId))

    // Calculate summary
    const summary = {
      total: records.length,
      pending: records.filter(r => r.status === 'pending').length,
      hasOwnInsurance: records.filter(r => r.status === 'has_own_insurance').length,
      declined: records.filter(r => r.status === 'declined').length,
      selectedPackage: records.filter(r => r.status === 'selected_package').length,
    }

    return {
      tripId,
      travelers: records.map(this.formatTravelerInsurance),
      summary,
    }
  }

  /**
   * Get a single traveler insurance record
   */
  async getTravelerInsuranceById(
    tripId: string,
    insuranceId: string
  ): Promise<TripTravelerInsuranceDto> {
    const [record] = await this.db.client
      .select()
      .from(this.db.schema.tripTravelerInsurance)
      .where(
        and(
          eq(this.db.schema.tripTravelerInsurance.id, insuranceId),
          eq(this.db.schema.tripTravelerInsurance.tripId, tripId)
        )
      )
      .limit(1)

    if (!record) {
      throw new NotFoundException(`Traveler insurance record ${insuranceId} not found`)
    }

    return this.formatTravelerInsurance(record)
  }

  /**
   * Create traveler insurance record
   */
  async createTravelerInsurance(
    tripId: string,
    dto: CreateTripTravelerInsuranceDto
  ): Promise<TripTravelerInsuranceDto> {
    await this.verifyTripExists(tripId)
    await this.verifyTravelerExists(dto.tripTravelerId)

    // Verify traveler belongs to this trip
    await this.verifyTravelerBelongsToTrip(dto.tripTravelerId, tripId)

    // Verify package belongs to this trip if specified
    if (dto.selectedPackageId) {
      await this.verifyPackageBelongsToTrip(dto.selectedPackageId, tripId)
    }

    // Validate status-specific requirements
    this.validateStatusRequirements(dto.status || 'pending', dto)

    const [record] = await this.db.client
      .insert(this.db.schema.tripTravelerInsurance)
      .values({
        tripId,
        tripTravelerId: dto.tripTravelerId,
        status: (dto.status as any) || 'pending',
        selectedPackageId: dto.selectedPackageId ?? null,
        externalPolicyNumber: dto.externalPolicyNumber ?? null,
        externalProviderName: dto.externalProviderName ?? null,
        externalCoverageDetails: dto.externalCoverageDetails ?? null,
        declinedReason: dto.declinedReason ?? null,
        declinedAt: dto.status === 'declined' ? new Date() : null,
        acknowledgedAt: dto.status === 'declined' ? new Date() : null,
        notes: dto.notes ?? null,
      })
      .returning()

    return this.formatTravelerInsurance(record)
  }

  /**
   * Update traveler insurance status
   */
  async updateTravelerInsurance(
    tripId: string,
    insuranceId: string,
    dto: UpdateTripTravelerInsuranceDto
  ): Promise<TripTravelerInsuranceDto> {
    const existing = await this.getTravelerInsuranceById(tripId, insuranceId)

    // Verify package belongs to this trip if specified
    if (dto.selectedPackageId) {
      await this.verifyPackageBelongsToTrip(dto.selectedPackageId, tripId)
    }

    // Validate status-specific requirements
    if (dto.status) {
      this.validateStatusRequirements(dto.status, dto)
    }

    const updateData: any = {
      ...dto,
      updatedAt: new Date(),
    }

    // Auto-set timestamps for status changes
    if (dto.status === 'declined' && existing.status !== 'declined') {
      updateData.declinedAt = new Date()
      updateData.acknowledgedAt = new Date()
    }

    const [record] = await this.db.client
      .update(this.db.schema.tripTravelerInsurance)
      .set(updateData)
      .where(eq(this.db.schema.tripTravelerInsurance.id, insuranceId))
      .returning()

    return this.formatTravelerInsurance(record)
  }

  /**
   * Delete traveler insurance record
   */
  async deleteTravelerInsurance(tripId: string, insuranceId: string): Promise<void> {
    await this.getTravelerInsuranceById(tripId, insuranceId) // Verify exists

    await this.db.client
      .delete(this.db.schema.tripTravelerInsurance)
      .where(eq(this.db.schema.tripTravelerInsurance.id, insuranceId))
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async verifyTripExists(tripId: string): Promise<void> {
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }
  }

  private async verifyTravelerExists(travelerId: string): Promise<void> {
    const [traveler] = await this.db.client
      .select({ id: this.db.schema.tripTravelers.id })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.id, travelerId))
      .limit(1)

    if (!traveler) {
      throw new NotFoundException(`Trip traveler ${travelerId} not found`)
    }
  }

  private validateStatusRequirements(
    status: string,
    dto: CreateTripTravelerInsuranceDto | UpdateTripTravelerInsuranceDto
  ): void {
    if (status === 'selected_package' && !dto.selectedPackageId) {
      throw new BadRequestException(
        'selectedPackageId is required when status is "selected_package"'
      )
    }

    if (
      status === 'has_own_insurance' &&
      !dto.externalPolicyNumber &&
      !dto.externalProviderName
    ) {
      throw new BadRequestException(
        'Either externalPolicyNumber or externalProviderName is required when status is "has_own_insurance"'
      )
    }
  }

  /**
   * Verify package belongs to the specified trip
   */
  private async verifyPackageBelongsToTrip(packageId: string, tripId: string): Promise<void> {
    const [pkg] = await this.db.client
      .select({ id: this.db.schema.tripInsurancePackages.id })
      .from(this.db.schema.tripInsurancePackages)
      .where(
        and(
          eq(this.db.schema.tripInsurancePackages.id, packageId),
          eq(this.db.schema.tripInsurancePackages.tripId, tripId)
        )
      )
      .limit(1)

    if (!pkg) {
      throw new BadRequestException(
        `Insurance package ${packageId} does not belong to trip ${tripId}`
      )
    }
  }

  /**
   * Verify traveler belongs to the specified trip
   */
  private async verifyTravelerBelongsToTrip(travelerId: string, tripId: string): Promise<void> {
    const [traveler] = await this.db.client
      .select({ id: this.db.schema.tripTravelers.id })
      .from(this.db.schema.tripTravelers)
      .where(
        and(
          eq(this.db.schema.tripTravelers.id, travelerId),
          eq(this.db.schema.tripTravelers.tripId, tripId)
        )
      )
      .limit(1)

    if (!traveler) {
      throw new BadRequestException(
        `Traveler ${travelerId} does not belong to trip ${tripId}`
      )
    }
  }

  /**
   * Verify that an activity exists, belongs to the same trip, and is of type 'insurance'
   */
  private async verifyActivityForInsurance(activityId: string, tripId: string): Promise<void> {
    const [activity] = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        activityType: this.db.schema.itineraryActivities.activityType,
        floatingTripId: this.db.schema.itineraryActivities.tripId,
        itineraryTripId: this.db.schema.itineraries.tripId,
      })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .leftJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    if (!activity) {
      throw new BadRequestException(`Activity ${activityId} not found`)
    }

    // Check trip ownership — activity may have tripId directly (floating) or via day→itinerary
    const activityTripId = activity.floatingTripId || activity.itineraryTripId
    if (activityTripId !== tripId) {
      throw new BadRequestException(
        `Activity ${activityId} does not belong to trip ${tripId}`
      )
    }

    if (activity.activityType !== 'insurance') {
      throw new BadRequestException(
        `Activity ${activityId} has type '${activity.activityType}', expected 'insurance'`
      )
    }
  }

  private formatPackage(pkg: any): TripInsurancePackageDto {
    return {
      id: pkg.id,
      tripId: pkg.tripId,
      providerName: pkg.providerName,
      packageName: pkg.packageName,
      policyType: pkg.policyType,
      coverageAmountCents: pkg.coverageAmountCents,
      premiumCents: pkg.premiumCents,
      deductibleCents: pkg.deductibleCents,
      currency: pkg.currency,
      coverageStartDate: pkg.coverageStartDate,
      coverageEndDate: pkg.coverageEndDate,
      coverageDetails: pkg.coverageDetails,
      termsUrl: pkg.termsUrl,
      activityId: pkg.activityId ?? null,
      isFromCatalog: pkg.isFromCatalog,
      displayOrder: pkg.displayOrder,
      isActive: pkg.isActive,
      createdAt: pkg.createdAt.toISOString(),
      updatedAt: pkg.updatedAt.toISOString(),
    }
  }

  private formatTravelerInsurance(record: any): TripTravelerInsuranceDto {
    return {
      id: record.id,
      tripId: record.tripId,
      tripTravelerId: record.tripTravelerId,
      status: record.status,
      selectedPackageId: record.selectedPackageId,
      externalPolicyNumber: record.externalPolicyNumber,
      externalProviderName: record.externalProviderName,
      externalCoverageDetails: record.externalCoverageDetails,
      declinedReason: record.declinedReason,
      declinedAt: record.declinedAt?.toISOString() || null,
      acknowledgedAt: record.acknowledgedAt?.toISOString() || null,
      premiumPaidCents: record.premiumPaidCents,
      policyNumber: record.policyNumber,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }
  }
}
