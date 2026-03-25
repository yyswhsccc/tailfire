/**
 * Forms Service
 *
 * Token-based public form system for insurance waivers, intake forms, etc.
 * Generates secure tokens that allow unauthenticated access to specific forms.
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a secure form token for public access
   */
  async createToken(params: {
    formType: string
    tripId?: string
    travelerIds?: string[]
    agencyId: string
    contextData?: Record<string, unknown>
    expiresInDays?: number
  }) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 30))

    const rows = await this.db.client
      .insert(this.db.schema.formTokens)
      .values({
        token,
        formType: params.formType,
        tripId: params.tripId,
        travelerIds: params.travelerIds,
        agencyId: params.agencyId,
        contextData: params.contextData,
        expiresAt,
      })
      .returning()

    const row = rows[0]!

    this.logger.log(`Created form token for ${params.formType} (trip: ${params.tripId ?? 'none'})`)

    return { id: row.id, token }
  }

  /**
   * Resolve and validate a form token
   * Throws if token is invalid, expired, or already completed
   */
  async resolveToken(token: string) {
    const [row] = await this.db.client
      .select()
      .from(this.db.schema.formTokens)
      .where(eq(this.db.schema.formTokens.token, token))
      .limit(1)

    if (!row) throw new NotFoundException('Form not found')
    if (row.completedAt) throw new BadRequestException('This form has already been submitted')
    if (new Date() > new Date(row.expiresAt)) throw new BadRequestException('This form has expired')

    return row
  }

  /**
   * Mark a form token as completed
   */
  async markCompleted(token: string) {
    await this.db.client
      .update(this.db.schema.formTokens)
      .set({ completedAt: new Date() })
      .where(eq(this.db.schema.formTokens.token, token))
  }

  /**
   * Handle insurance waiver form submission
   * Updates trip_traveler_insurance for each traveler decision
   */
  async handleInsuranceWaiverSubmission(
    form: { tripId: string | null; travelerIds: string[] | null; agencyId: string },
    body: Record<string, unknown>,
  ) {
    const decisions = body.decisions as Array<{
      travelerId: string
      action: 'purchase' | 'decline'
      packageId?: string
      reason?: string
    }>

    if (!Array.isArray(decisions) || decisions.length === 0) {
      throw new BadRequestException('decisions array is required')
    }

    if (!form.tripId) {
      throw new BadRequestException('Form is not associated with a trip')
    }

    const { tripTravelerInsurance } = this.db.schema
    const now = new Date()

    for (const decision of decisions) {
      if (decision.action === 'purchase') {
        if (!decision.packageId) {
          throw new BadRequestException(`packageId is required when action is 'purchase' for traveler ${decision.travelerId}`)
        }

        // Upsert: update if exists, otherwise insert
        const [existing] = await this.db.client
          .select({ id: tripTravelerInsurance.id })
          .from(tripTravelerInsurance)
          .where(
            and(
              eq(tripTravelerInsurance.tripId, form.tripId),
              eq(tripTravelerInsurance.tripTravelerId, decision.travelerId),
            ),
          )
          .limit(1)

        if (existing) {
          await this.db.client
            .update(tripTravelerInsurance)
            .set({
              status: 'selected_package',
              selectedPackageId: decision.packageId,
              updatedAt: now,
            })
            .where(eq(tripTravelerInsurance.id, existing.id))
        } else {
          await this.db.client
            .insert(tripTravelerInsurance)
            .values({
              tripId: form.tripId,
              tripTravelerId: decision.travelerId,
              status: 'selected_package',
              selectedPackageId: decision.packageId,
            })
        }

        this.logger.log(`Traveler ${decision.travelerId} selected package ${decision.packageId}`)
      } else if (decision.action === 'decline') {
        const [existing] = await this.db.client
          .select({ id: tripTravelerInsurance.id })
          .from(tripTravelerInsurance)
          .where(
            and(
              eq(tripTravelerInsurance.tripId, form.tripId),
              eq(tripTravelerInsurance.tripTravelerId, decision.travelerId),
            ),
          )
          .limit(1)

        if (existing) {
          await this.db.client
            .update(tripTravelerInsurance)
            .set({
              status: 'declined',
              declinedAt: now,
              acknowledgedAt: now,
              declinedReason: decision.reason ?? null,
              updatedAt: now,
            })
            .where(eq(tripTravelerInsurance.id, existing.id))
        } else {
          await this.db.client
            .insert(tripTravelerInsurance)
            .values({
              tripId: form.tripId,
              tripTravelerId: decision.travelerId,
              status: 'declined',
              declinedAt: now,
              acknowledgedAt: now,
              declinedReason: decision.reason ?? null,
            })
        }

        this.logger.log(`Traveler ${decision.travelerId} declined insurance${decision.reason ? `: ${decision.reason}` : ''}`)
      }
    }
  }
}
