/**
 * Traveler Bookings Service
 *
 * Manages per-traveler booking records on activities.
 * Each record stores a traveler's individual confirmation number, pricing,
 * and booking details (cabin, seat, room, etc.) as JSON.
 *
 * The auto-link trigger on traveler_bookings automatically creates
 * corresponding activity_travelers rows.
 */

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { TravelerBookingDto, CreateTravelerBookingDto, UpdateTravelerBookingDto } from '@tailfire/shared-types'

@Injectable()
export class TravelerBookingsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Find all traveler bookings for an activity
   */
  async findByActivityId(activityId: string): Promise<TravelerBookingDto[]> {
    const results = await this.db.client
      .select({
        id: this.db.schema.travelerBookings.id,
        activityId: this.db.schema.travelerBookings.activityId,
        tripTravelerId: this.db.schema.travelerBookings.tripTravelerId,
        confirmationNumber: this.db.schema.travelerBookings.confirmationNumber,
        bookingReference: this.db.schema.travelerBookings.bookingReference,
        bookingStatus: this.db.schema.travelerBookings.bookingStatus,
        supplier: this.db.schema.travelerBookings.supplier,
        priceCents: this.db.schema.travelerBookings.priceCents,
        currency: this.db.schema.travelerBookings.currency,
        commissionCents: this.db.schema.travelerBookings.commissionCents,
        bookingDetailsJson: this.db.schema.travelerBookings.bookingDetailsJson,
        externalBookingId: this.db.schema.travelerBookings.externalBookingId,
        externalSystem: this.db.schema.travelerBookings.externalSystem,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
        contactFirstName: this.db.schema.contacts.firstName,
        contactLastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.travelerBookings)
      .innerJoin(
        this.db.schema.tripTravelers,
        eq(this.db.schema.travelerBookings.tripTravelerId, this.db.schema.tripTravelers.id)
      )
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
      )
      .where(eq(this.db.schema.travelerBookings.activityId, activityId))

    return results.map((r) => this.toDto(r))
  }

  /**
   * Find all traveler bookings across a trip (for bookings tab aggregate)
   */
  async findByTripId(tripId: string): Promise<TravelerBookingDto[]> {
    const results = await this.db.client
      .select({
        id: this.db.schema.travelerBookings.id,
        activityId: this.db.schema.travelerBookings.activityId,
        tripTravelerId: this.db.schema.travelerBookings.tripTravelerId,
        confirmationNumber: this.db.schema.travelerBookings.confirmationNumber,
        bookingReference: this.db.schema.travelerBookings.bookingReference,
        bookingStatus: this.db.schema.travelerBookings.bookingStatus,
        supplier: this.db.schema.travelerBookings.supplier,
        priceCents: this.db.schema.travelerBookings.priceCents,
        currency: this.db.schema.travelerBookings.currency,
        commissionCents: this.db.schema.travelerBookings.commissionCents,
        bookingDetailsJson: this.db.schema.travelerBookings.bookingDetailsJson,
        externalBookingId: this.db.schema.travelerBookings.externalBookingId,
        externalSystem: this.db.schema.travelerBookings.externalSystem,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
        contactFirstName: this.db.schema.contacts.firstName,
        contactLastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.travelerBookings)
      .innerJoin(
        this.db.schema.tripTravelers,
        eq(this.db.schema.travelerBookings.tripTravelerId, this.db.schema.tripTravelers.id)
      )
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
      )
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    return results.map((r) => this.toDto(r))
  }

  /**
   * Create a traveler booking for an activity
   */
  async create(
    activityId: string,
    agencyId: string,
    dto: CreateTravelerBookingDto,
    tripId?: string
  ): Promise<TravelerBookingDto> {
    // Verify trip traveler exists
    const [traveler] = await this.db.client
      .select({
        id: this.db.schema.tripTravelers.id,
        tripId: this.db.schema.tripTravelers.tripId,
      })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.id, dto.tripTravelerId))
      .limit(1)

    if (!traveler) {
      throw new BadRequestException(`Trip traveler ${dto.tripTravelerId} not found`)
    }

    // Validate traveler belongs to the same trip as the activity
    if (tripId && traveler.tripId !== tripId) {
      throw new BadRequestException(
        `Traveler belongs to a different trip than the activity`
      )
    }

    let inserted: typeof this.db.schema.travelerBookings.$inferSelect
    try {
      const [result] = await this.db.client
        .insert(this.db.schema.travelerBookings)
        .values({
          activityId,
          tripTravelerId: dto.tripTravelerId,
          agencyId,
          confirmationNumber: dto.confirmationNumber ?? null,
          bookingReference: dto.bookingReference ?? null,
          bookingStatus: dto.bookingStatus ?? 'confirmed',
          supplier: dto.supplier ?? null,
          priceCents: dto.priceCents ?? null,
          currency: dto.currency ?? 'CAD',
          commissionCents: dto.commissionCents ?? null,
          bookingDetailsJson: dto.bookingDetailsJson ?? {},
          externalBookingId: dto.externalBookingId ?? null,
          externalSystem: dto.externalSystem ?? null,
        })
        .returning()

      if (!result) {
        throw new BadRequestException('Failed to create traveler booking')
      }
      inserted = result
    } catch (error: any) {
      const pgCode = error?.code || error?.cause?.code
      if (pgCode === '23505' || error?.message?.includes('duplicate key') || error?.message?.includes('unique constraint')) {
        throw new ConflictException(
          `A booking already exists for this traveler on this activity`
        )
      }
      throw error
    }

    // Re-fetch with joins to get traveler name
    const [result] = await this.db.client
      .select({
        id: this.db.schema.travelerBookings.id,
        activityId: this.db.schema.travelerBookings.activityId,
        tripTravelerId: this.db.schema.travelerBookings.tripTravelerId,
        confirmationNumber: this.db.schema.travelerBookings.confirmationNumber,
        bookingReference: this.db.schema.travelerBookings.bookingReference,
        bookingStatus: this.db.schema.travelerBookings.bookingStatus,
        supplier: this.db.schema.travelerBookings.supplier,
        priceCents: this.db.schema.travelerBookings.priceCents,
        currency: this.db.schema.travelerBookings.currency,
        commissionCents: this.db.schema.travelerBookings.commissionCents,
        bookingDetailsJson: this.db.schema.travelerBookings.bookingDetailsJson,
        externalBookingId: this.db.schema.travelerBookings.externalBookingId,
        externalSystem: this.db.schema.travelerBookings.externalSystem,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
        contactFirstName: this.db.schema.contacts.firstName,
        contactLastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.travelerBookings)
      .innerJoin(
        this.db.schema.tripTravelers,
        eq(this.db.schema.travelerBookings.tripTravelerId, this.db.schema.tripTravelers.id)
      )
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
      )
      .where(eq(this.db.schema.travelerBookings.id, inserted.id))

    return this.toDto(result)
  }

  /**
   * Update a traveler booking
   */
  async update(id: string, dto: UpdateTravelerBookingDto): Promise<TravelerBookingDto> {
    const [existing] = await this.db.client
      .select({ id: this.db.schema.travelerBookings.id })
      .from(this.db.schema.travelerBookings)
      .where(eq(this.db.schema.travelerBookings.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Traveler booking ${id} not found`)
    }

    await this.db.client
      .update(this.db.schema.travelerBookings)
      .set({
        ...(dto.confirmationNumber !== undefined && { confirmationNumber: dto.confirmationNumber }),
        ...(dto.bookingReference !== undefined && { bookingReference: dto.bookingReference }),
        ...(dto.bookingStatus !== undefined && { bookingStatus: dto.bookingStatus }),
        ...(dto.supplier !== undefined && { supplier: dto.supplier }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.commissionCents !== undefined && { commissionCents: dto.commissionCents }),
        ...(dto.bookingDetailsJson !== undefined && { bookingDetailsJson: dto.bookingDetailsJson }),
        ...(dto.externalBookingId !== undefined && { externalBookingId: dto.externalBookingId }),
        ...(dto.externalSystem !== undefined && { externalSystem: dto.externalSystem }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.travelerBookings.id, id))

    // Re-fetch with joins
    const [result] = await this.db.client
      .select({
        id: this.db.schema.travelerBookings.id,
        activityId: this.db.schema.travelerBookings.activityId,
        tripTravelerId: this.db.schema.travelerBookings.tripTravelerId,
        confirmationNumber: this.db.schema.travelerBookings.confirmationNumber,
        bookingReference: this.db.schema.travelerBookings.bookingReference,
        bookingStatus: this.db.schema.travelerBookings.bookingStatus,
        supplier: this.db.schema.travelerBookings.supplier,
        priceCents: this.db.schema.travelerBookings.priceCents,
        currency: this.db.schema.travelerBookings.currency,
        commissionCents: this.db.schema.travelerBookings.commissionCents,
        bookingDetailsJson: this.db.schema.travelerBookings.bookingDetailsJson,
        externalBookingId: this.db.schema.travelerBookings.externalBookingId,
        externalSystem: this.db.schema.travelerBookings.externalSystem,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
        contactFirstName: this.db.schema.contacts.firstName,
        contactLastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.travelerBookings)
      .innerJoin(
        this.db.schema.tripTravelers,
        eq(this.db.schema.travelerBookings.tripTravelerId, this.db.schema.tripTravelers.id)
      )
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
      )
      .where(eq(this.db.schema.travelerBookings.id, id))

    return this.toDto(result)
  }

  /**
   * Delete a traveler booking
   */
  async delete(id: string): Promise<void> {
    const [existing] = await this.db.client
      .select({ id: this.db.schema.travelerBookings.id })
      .from(this.db.schema.travelerBookings)
      .where(eq(this.db.schema.travelerBookings.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Traveler booking ${id} not found`)
    }

    await this.db.client
      .delete(this.db.schema.travelerBookings)
      .where(eq(this.db.schema.travelerBookings.id, id))
  }

  /**
   * Get the activity ID for a traveler booking (used for access control)
   */
  async getActivityIdForBooking(bookingId: string): Promise<string> {
    const [booking] = await this.db.client
      .select({ activityId: this.db.schema.travelerBookings.activityId })
      .from(this.db.schema.travelerBookings)
      .where(eq(this.db.schema.travelerBookings.id, bookingId))
      .limit(1)

    if (!booking) {
      throw new NotFoundException(`Traveler booking ${bookingId} not found`)
    }

    return booking.activityId
  }

  /**
   * Map a query result row to TravelerBookingDto
   */
  private toDto(r: any): TravelerBookingDto {
    const snapshot = r.contactSnapshot as { firstName?: string; lastName?: string } | null
    const firstName = snapshot?.firstName || r.contactFirstName || ''
    const lastName = snapshot?.lastName || r.contactLastName || ''

    return {
      id: r.id,
      activityId: r.activityId,
      tripTravelerId: r.tripTravelerId,
      travelerName: `${firstName} ${lastName}`.trim() || 'Unknown',
      confirmationNumber: r.confirmationNumber ?? null,
      bookingReference: r.bookingReference ?? null,
      bookingStatus: r.bookingStatus ?? null,
      supplier: r.supplier ?? null,
      priceCents: r.priceCents ?? null,
      currency: r.currency,
      commissionCents: r.commissionCents ?? null,
      bookingDetailsJson: (r.bookingDetailsJson as Record<string, unknown>) ?? {},
      externalBookingId: r.externalBookingId ?? null,
      externalSystem: r.externalSystem ?? null,
    }
  }
}
