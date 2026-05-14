/**
 * Flight Segments Service
 *
 * Handles CRUD operations for multi-segment flight data.
 * Works with the flight_segments table (one-to-many with activities).
 *
 * For backward compatibility:
 * - When reading: returns segments[] and populates legacy fields from first segment
 * - When writing: accepts segments[], falls back to legacy fields if no segments
 */

import { Injectable } from '@nestjs/common'
import { eq, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { FlightSegmentDto } from '@tailfire/shared-types'

@Injectable()
export class FlightSegmentsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all flight segments for an activity, ordered by segmentOrder
   */
  async findByActivityId(activityId: string): Promise<FlightSegmentDto[]> {
    const segments = await this.db.client
      .select()
      .from(this.db.schema.flightSegments)
      .where(eq(this.db.schema.flightSegments.activityId, activityId))
      .orderBy(asc(this.db.schema.flightSegments.segmentOrder))

    return segments.map(this.formatSegment)
  }

  /**
   * Create multiple flight segments for an activity
   * Replaces any existing segments (delete + insert) atomically.
   * If the incoming list has duplicate segmentOrder values, the last entry
   * wins — protects against the flight_segments_activity_order_unique
   * constraint violation reported in #321.
   */
  async createMany(activityId: string, segments: FlightSegmentDto[]): Promise<void> {
    if (!segments || segments.length === 0) {
      return
    }

    // De-duplicate by effective segmentOrder so we never feed the unique
    // index a clashing pair (e.g. two entries with segmentOrder: 0, or an
    // explicit 0 colliding with an unset entry's index fallback).
    const byOrder = new Map<number, FlightSegmentDto & { _index: number }>()
    segments.forEach((segment, index) => {
      const order = segment.segmentOrder ?? index
      byOrder.set(order, { ...segment, _index: index })
    })

    // Insert new segments
    const values = Array.from(byOrder.entries()).map(([order, segment]) => ({
      activityId,
      segmentOrder: order,
      airline: segment.airline || null,
      flightNumber: segment.flightNumber || null,
      // Departure details
      departureAirportCode: segment.departureAirportCode || null,
      departureAirportName: segment.departureAirportName || null,
      departureAirportCity: segment.departureAirportCity || null,
      departureAirportLat: segment.departureAirportLat ?? null,
      departureAirportLon: segment.departureAirportLon ?? null,
      departureDate: segment.departureDate || null,
      departureTime: segment.departureTime || null,
      departureTimezone: segment.departureTimezone || null,
      departureTerminal: segment.departureTerminal || null,
      departureGate: segment.departureGate || null,
      // Arrival details
      arrivalAirportCode: segment.arrivalAirportCode || null,
      arrivalAirportName: segment.arrivalAirportName || null,
      arrivalAirportCity: segment.arrivalAirportCity || null,
      arrivalAirportLat: segment.arrivalAirportLat ?? null,
      arrivalAirportLon: segment.arrivalAirportLon ?? null,
      arrivalDate: segment.arrivalDate || null,
      arrivalTime: segment.arrivalTime || null,
      arrivalTimezone: segment.arrivalTimezone || null,
      arrivalTerminal: segment.arrivalTerminal || null,
      arrivalGate: segment.arrivalGate || null,
      // Aircraft details
      aircraftModel: segment.aircraftModel || null,
      aircraftRegistration: segment.aircraftRegistration || null,
      aircraftModeS: segment.aircraftModeS || null,
      aircraftImageUrl: segment.aircraftImageUrl || null,
      aircraftImageAuthor: segment.aircraftImageAuthor || null,
    }))

    // Delete + insert in a single transaction so a concurrent PATCH cannot
    // race and double-insert against the unique (activity_id, segment_order)
    // index — root cause of #321.
    await this.db.client.transaction(async (tx) => {
      await tx
        .delete(this.db.schema.flightSegments)
        .where(eq(this.db.schema.flightSegments.activityId, activityId))
      await tx.insert(this.db.schema.flightSegments).values(values)
    })
  }

  /**
   * Update segments for an activity (replace all). Treats an empty input as
   * "clear all segments" — important so a PATCH that removes every segment
   * actually empties the table instead of leaving the prior rows behind.
   */
  async updateMany(activityId: string, segments: FlightSegmentDto[]): Promise<void> {
    if (!segments || segments.length === 0) {
      await this.deleteByActivityId(activityId)
      return
    }
    await this.createMany(activityId, segments)
  }

  /**
   * Delete all flight segments for an activity
   */
  async deleteByActivityId(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.flightSegments)
      .where(eq(this.db.schema.flightSegments.activityId, activityId))
  }

  /**
   * Check if any segments exist for an activity
   */
  async hasSegments(activityId: string): Promise<boolean> {
    const [result] = await this.db.client
      .select({ id: this.db.schema.flightSegments.id })
      .from(this.db.schema.flightSegments)
      .where(eq(this.db.schema.flightSegments.activityId, activityId))
      .limit(1)

    return !!result
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatSegment(row: any): FlightSegmentDto {
    return {
      id: row.id,
      segmentOrder: row.segmentOrder ?? 0,
      airline: row.airline || null,
      flightNumber: row.flightNumber || null,
      // Departure details
      departureAirportCode: row.departureAirportCode || null,
      departureAirportName: row.departureAirportName || null,
      departureAirportCity: row.departureAirportCity || null,
      departureAirportLat: row.departureAirportLat ?? null,
      departureAirportLon: row.departureAirportLon ?? null,
      departureDate: row.departureDate || null,
      departureTime: row.departureTime || null,
      departureTimezone: row.departureTimezone || null,
      departureTerminal: row.departureTerminal || null,
      departureGate: row.departureGate || null,
      // Arrival details
      arrivalAirportCode: row.arrivalAirportCode || null,
      arrivalAirportName: row.arrivalAirportName || null,
      arrivalAirportCity: row.arrivalAirportCity || null,
      arrivalAirportLat: row.arrivalAirportLat ?? null,
      arrivalAirportLon: row.arrivalAirportLon ?? null,
      arrivalDate: row.arrivalDate || null,
      arrivalTime: row.arrivalTime || null,
      arrivalTimezone: row.arrivalTimezone || null,
      arrivalTerminal: row.arrivalTerminal || null,
      arrivalGate: row.arrivalGate || null,
      // Aircraft details
      aircraftModel: row.aircraftModel || null,
      aircraftRegistration: row.aircraftRegistration || null,
      aircraftModeS: row.aircraftModeS || null,
      aircraftImageUrl: row.aircraftImageUrl || null,
      aircraftImageAuthor: row.aircraftImageAuthor || null,
    }
  }
}
