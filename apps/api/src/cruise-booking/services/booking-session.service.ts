/**
 * Booking Session Service
 *
 * Manages cruise booking session state in the database.
 * Handles session lifecycle: active → completed/expired/cancelled
 *
 * Key responsibilities:
 * - Session CRUD operations
 * - Handoff authorization (agent → client)
 * - Session expiry management
 */

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'

// Types defined locally to avoid dependency on unexported types from @tailfire/database
export type BookingSessionStatus = 'active' | 'expired' | 'completed' | 'cancelled'
export type BookingFlowType = 'agent' | 'client_handoff' | 'ota'

const { cruiseBookingSessions, cruiseBookingIdempotency, customCruiseDetails } = schema

// Session expiry configuration
const SESSION_TTL_HOURS = 2
const HOLD_WARNING_MINUTES = 5 // Warn when hold has < 5 min remaining

export interface CreateSessionParams {
  activityId: string
  userId: string
  tripId?: string
  tripTravelerId?: string
  flowType: BookingFlowType
  sessionKey: string
  sessionExpiresAt: Date
  codetocruiseid?: string
  resultNo?: string
}

export interface UpdateSessionParams {
  fareCode?: string
  gradeNo?: number
  cabinNo?: string
  basketItemKey?: string
  cabinResult?: string
  holdExpiresAt?: Date
  status?: BookingSessionStatus
}

export interface SessionInfo {
  id: string
  activityId: string
  userId: string | null
  tripId: string | null
  tripTravelerId: string | null
  status: BookingSessionStatus
  flowType: BookingFlowType
  sessionKey: string
  sessionExpiresAt: Date
  codetocruiseid: string | null
  resultNo: string | null
  fareCode: string | null
  gradeNo: number | null
  cabinNo: string | null
  basketItemKey: string | null
  cabinResult: string | null
  holdExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class BookingSessionService {
  private readonly logger = new Logger(BookingSessionService.name)

  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // Authorization
  // ============================================================================

  /**
   * Verify that an activity belongs to the user's agency or their trip
   * This is a critical security check before creating sessions or completing bookings
   */
  async verifyActivityOwnership(
    activityId: string,
    userId: string
  ): Promise<{ valid: boolean; tripId?: string; tripTravelerId?: string; reason?: string }> {
    interface OwnershipRow {
      trip_id: string
      trip_traveler_id: string | null
      agency_id: string | null
      user_agency_id: string | null
      is_trip_owner: boolean
    }

    // Check if user is either:
    // 1. An agent in the agency that owns the trip
    // 2. A client who is a traveler on the trip
    const [row] = await this.db.client.execute(sql`
      SELECT
        t.id as trip_id,
        tt.id as trip_traveler_id,
        t.agency_id as agency_id,
        p.agency_id as user_agency_id,
        (t.created_by = ${userId}) as is_trip_owner
      FROM itinerary_activities ia
      JOIN itinerary_days id ON id.id = ia.day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN profiles p ON p.id = ${userId}
      LEFT JOIN trip_travelers tt ON tt.trip_id = t.id
      LEFT JOIN contacts c ON c.id = tt.contact_id AND c.user_id = ${userId}
      WHERE ia.id = ${activityId}
        AND (
          -- Agent: user's agency matches trip's agency
          (p.agency_id IS NOT NULL AND p.agency_id = t.agency_id)
          -- Client: user is linked as a traveler on the trip
          OR c.user_id IS NOT NULL
          -- Trip owner
          OR t.created_by = ${userId}
        )
      LIMIT 1
    `) as unknown as OwnershipRow[]

    if (!row) {
      return {
        valid: false,
        reason: 'Activity does not belong to your agency or trip',
      }
    }

    return {
      valid: true,
      tripId: row.trip_id,
      tripTravelerId: row.trip_traveler_id || undefined,
    }
  }

  // ============================================================================
  // Session CRUD
  // ============================================================================

  /**
   * Get active session for an activity
   */
  async getActiveSession(activityId: string): Promise<SessionInfo | null> {
    const session = await this.db.client.query.cruiseBookingSessions.findFirst({
      where: and(
        eq(cruiseBookingSessions.activityId, activityId),
        eq(cruiseBookingSessions.status, 'active')
      ),
    })

    return session as SessionInfo | null
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.db.client.query.cruiseBookingSessions.findFirst({
      where: eq(cruiseBookingSessions.id, sessionId),
    })

    return session as SessionInfo | null
  }

  /**
   * Create a new session
   *
   * SECURITY: Verifies activity ownership before creating session
   */
  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    this.logger.log(`Creating booking session for activity ${params.activityId}`)

    // CRITICAL: Verify user has access to this activity
    const ownership = await this.verifyActivityOwnership(params.activityId, params.userId)
    if (!ownership.valid) {
      throw new ForbiddenException(ownership.reason || 'Not authorized to create session for this activity')
    }

    // Check for existing active session and mark it as cancelled
    const existing = await this.getActiveSession(params.activityId)
    if (existing) {
      this.logger.debug(`Cancelling existing session ${existing.id}`)
      await this.updateSession(existing.id, { status: 'cancelled' })
    }

    const [session] = await this.db.client
      .insert(cruiseBookingSessions)
      .values({
        activityId: params.activityId,
        userId: params.userId,
        tripId: params.tripId || ownership.tripId,
        tripTravelerId: params.tripTravelerId || ownership.tripTravelerId,
        flowType: params.flowType,
        sessionKey: params.sessionKey,
        sessionExpiresAt: params.sessionExpiresAt,
        codetocruiseid: params.codetocruiseid,
        resultNo: params.resultNo,
        status: 'active',
      })
      .returning()

    this.logger.log(`Created session ${session!.id}`)
    return session as SessionInfo
  }

  /**
   * Update an existing session
   */
  async updateSession(sessionId: string, params: UpdateSessionParams): Promise<SessionInfo> {
    const [session] = await this.db.client
      .update(cruiseBookingSessions)
      .set({
        ...params,
        updatedAt: new Date(),
      })
      .where(eq(cruiseBookingSessions.id, sessionId))
      .returning()

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`)
    }

    return session as SessionInfo
  }

  /**
   * Extend session expiry (call on each FusionAPI interaction)
   */
  async extendSessionExpiry(sessionId: string): Promise<void> {
    const newExpiry = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000)

    await this.db.client
      .update(cruiseBookingSessions)
      .set({
        sessionExpiresAt: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(cruiseBookingSessions.id, sessionId))
  }

  /**
   * Mark session as completed (after successful booking)
   *
   * SECURITY: Verifies session ownership before updating custom_cruise_details
   */
  async completeSession(sessionId: string, bookingRef: string, userId: string): Promise<void> {
    this.logger.log(`Completing session ${sessionId} with booking ${bookingRef}`)

    const session = await this.getSessionById(sessionId)
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`)
    }

    // CRITICAL: Verify user has access to this activity before updating
    const ownership = await this.verifyActivityOwnership(session.activityId, userId)
    if (!ownership.valid) {
      throw new ForbiddenException(ownership.reason || 'Not authorized to complete this booking')
    }

    // Update session status
    await this.updateSession(sessionId, { status: 'completed' })

    // Copy booking reference to custom_cruise_details (durable storage)
    await this.db.client
      .update(customCruiseDetails)
      .set({
        fusionBookingRef: bookingRef,
        fusionBookingStatus: 'confirmed',
        fusionBookedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customCruiseDetails.activityId, session.activityId))
  }

  /**
   * Mark session as cancelled
   */
  async cancelSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, { status: 'cancelled' })
  }

  // ============================================================================
  // Handoff Authorization
  // ============================================================================

  /**
   * Check if a client can access an agent's session (handoff flow)
   *
   * Requirements:
   * 1. Activity belongs to a trip where client is linked as a traveler
   * 2. Session is not expired
   * 3. Trip status allows client booking (quoted/accepted)
   */
  async canHandoffSession(
    activityId: string,
    clientUserId: string
  ): Promise<{ allowed: boolean; reason?: string; session?: SessionInfo }> {
    // Get active session
    const session = await this.getActiveSession(activityId)
    if (!session) {
      return { allowed: false, reason: 'No active session found' }
    }

    // Check session expiry
    if (new Date(session.sessionExpiresAt) < new Date()) {
      return { allowed: false, reason: 'Session has expired' }
    }

    // Check trip authorization
    interface HandoffAuthRow {
      trip_id: string
      trip_status: string
      trip_traveler_id: string
      contact_user_id: string
    }

    const [row] = await this.db.client.execute(sql`
      SELECT
        t.id as trip_id,
        t.status as trip_status,
        tt.id as trip_traveler_id,
        c.user_id as contact_user_id
      FROM itinerary_activities ia
      JOIN itinerary_days id ON id.id = ia.day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN trip_travelers tt ON tt.trip_id = t.id
      JOIN contacts c ON c.id = tt.contact_id
      WHERE ia.id = ${activityId}
        AND c.user_id = ${clientUserId}
        AND t.status IN ('planning', 'accepted')
      LIMIT 1
    `) as unknown as HandoffAuthRow[]

    if (!row) {
      return {
        allowed: false,
        reason: 'Client is not authorized to access this booking session',
      }
    }

    // Update session for handoff
    await this.db.client
      .update(cruiseBookingSessions)
      .set({
        flowType: 'client_handoff',
        tripId: row.trip_id,
        tripTravelerId: row.trip_traveler_id,
        updatedAt: new Date(),
      })
      .where(eq(cruiseBookingSessions.id, session.id))

    return { allowed: true, session }
  }

  /**
   * Validate session ownership for an action
   */
  async validateSessionOwnership(
    sessionId: string,
    userId: string,
    requiredFlowTypes?: BookingFlowType[]
  ): Promise<SessionInfo> {
    const session = await this.getSessionById(sessionId)

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`)
    }

    if (session.status !== 'active') {
      throw new ForbiddenException(`Session is ${session.status}, not active`)
    }

    if (new Date(session.sessionExpiresAt) < new Date()) {
      await this.updateSession(sessionId, { status: 'expired' })
      throw new ForbiddenException('Session has expired')
    }

    // Check flow type restrictions
    if (requiredFlowTypes && !requiredFlowTypes.includes(session.flowType)) {
      throw new ForbiddenException(`Operation not allowed for flow type: ${session.flowType}`)
    }

    // Owner check - either session creator or authorized handoff
    if (session.userId !== userId) {
      // For handoff, verify client is linked to the trip
      if (session.flowType === 'client_handoff' && session.tripTravelerId) {
        const handoff = await this.canHandoffSession(session.activityId, userId)
        if (!handoff.allowed) {
          throw new ForbiddenException(handoff.reason || 'Not authorized')
        }
      } else {
        throw new ForbiddenException('Not authorized to access this session')
      }
    }

    return session
  }

  // ============================================================================
  // Idempotency
  // ============================================================================

  /**
   * Check for existing booking with idempotency key
   */
  async findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<{ found: boolean; bookingRef?: string; bookingResponse?: unknown }> {
    const record = await this.db.client.query.cruiseBookingIdempotency.findFirst({
      where: eq(cruiseBookingIdempotency.idempotencyKey, idempotencyKey),
    })

    if (!record) {
      return { found: false }
    }

    if (record.status === 'success') {
      return {
        found: true,
        bookingRef: record.bookingRef || undefined,
        bookingResponse: record.bookingResponse,
      }
    }

    // Pending or failed - let caller decide how to handle
    return { found: true }
  }

  /**
   * Create idempotency record (before attempting booking)
   */
  async createIdempotencyRecord(
    idempotencyKey: string,
    activityId: string,
    userId: string
  ): Promise<void> {
    await this.db.client.insert(cruiseBookingIdempotency).values({
      idempotencyKey,
      activityId,
      userId,
      status: 'pending',
    })
  }

  /**
   * Update idempotency record with booking result
   */
  async updateIdempotencyRecord(
    idempotencyKey: string,
    success: boolean,
    bookingRef?: string,
    bookingResponse?: unknown
  ): Promise<void> {
    await this.db.client
      .update(cruiseBookingIdempotency)
      .set({
        status: success ? 'success' : 'failed',
        bookingRef: bookingRef || null,
        bookingResponse: bookingResponse || null,
      })
      .where(eq(cruiseBookingIdempotency.idempotencyKey, idempotencyKey))
  }

  // ============================================================================
  // Hold Status
  // ============================================================================

  /**
   * Get hold status for a session
   */
  getHoldStatus(session: SessionInfo): {
    isHeld: boolean
    expiresAt?: Date
    remainingMinutes?: number
    isWarning: boolean
  } {
    if (!session.holdExpiresAt) {
      return { isHeld: false, isWarning: false }
    }

    const expiresAt = new Date(session.holdExpiresAt)
    const now = new Date()

    if (expiresAt < now) {
      return { isHeld: false, isWarning: false }
    }

    const remainingMs = expiresAt.getTime() - now.getTime()
    const remainingMinutes = Math.floor(remainingMs / 60000)

    return {
      isHeld: true,
      expiresAt,
      remainingMinutes,
      isWarning: remainingMinutes < HOLD_WARNING_MINUTES,
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Expire stale sessions (called by cron job)
   */
  async expireStaleSessions(): Promise<number> {
    const result = await this.db.client
      .update(cruiseBookingSessions)
      .set({ status: 'expired' })
      .where(
        and(
          eq(cruiseBookingSessions.status, 'active'),
          sql`${cruiseBookingSessions.sessionExpiresAt} < now()`
        )
      )
      .returning()

    const count = result.length
    if (count > 0) {
      this.logger.log(`Expired ${count} stale booking sessions`)
    }

    return count
  }

  /**
   * Clean up old idempotency records (called by cron job)
   */
  async cleanupIdempotencyRecords(): Promise<number> {
    const result = await this.db.client
      .delete(cruiseBookingIdempotency)
      .where(sql`${cruiseBookingIdempotency.expiresAt} < now()`)
      .returning()

    const count = result.length
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired idempotency records`)
    }

    return count
  }
}
