/**
 * PaymentScheduleLockPolicy — Step 5 of the refactor roadmap (#361).
 *
 * Owns the rule that determines when a payment schedule is locked from
 * edits. Today this rule lives inline at multiple call sites inside
 * `PaymentSchedulesService.ensureTripEditable()` and elsewhere. Extracted
 * as a pure decision class so:
 *
 *   - The rule has a single authority and a focused spec
 *   - Callers can pre-check without performing the side-effect
 *   - Future rule changes (per-trip override, agent-level bypass, etc.)
 *     land in one place
 *
 * **Error mode: strict (per CLAUDE.md section 8).** This policy throws
 * a BadRequestException when the schedule is locked. Payment data
 * integrity is non-negotiable — silently allowing a locked-schedule edit
 * is exactly the class of bug the #368 doctrine prevents. NO `try*`
 * prefix, NO swallowed errors.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import type { TripStatus } from '@tailfire/shared-types'

/**
 * Trip statuses that lock the payment schedule from non-admin edits.
 * Departure marks the point where edits become disruptive — after that,
 * billed-to-client information has typically been printed/sent.
 */
export const PAYMENT_SCHEDULE_LOCKING_STATUSES: readonly TripStatus[] = [
  'travelling',
  'travelled',
  'cancelled',
] as const

export interface AssertEditableInput {
  tripStatus: TripStatus | string
  isAdmin?: boolean
}

@Injectable()
export class PaymentScheduleLockPolicy {
  /**
   * Returns true when the trip status currently locks payment schedule
   * edits. Caller can call this to gate UI affordances without triggering
   * the assert path.
   */
  isLockedByStatus(tripStatus: TripStatus | string): boolean {
    return PAYMENT_SCHEDULE_LOCKING_STATUSES.includes(tripStatus as TripStatus)
  }

  /**
   * Assert the schedule is editable for the given trip status + actor.
   *
   * - Admin bypasses the lock unconditionally.
   * - Non-admin actors are blocked when status is in the locking set.
   *
   * @throws BadRequestException when the schedule is locked and actor is
   *         not admin.
   */
  assertEditable(input: AssertEditableInput): void {
    if (input.isAdmin) return
    if (this.isLockedByStatus(input.tripStatus)) {
      throw new BadRequestException(
        'Payment schedule cannot be modified after the trip has departed. Contact an admin for changes.',
      )
    }
  }
}
