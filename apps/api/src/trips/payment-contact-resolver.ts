/**
 * PaymentContactResolver — Step 5 of the refactor roadmap (#361).
 *
 * Resolves which contact a payment transaction should be attributed to.
 * Today this lives inline in `PaymentSchedulesService.resolveTransactionContactId()`
 * mixing DB reads with the precedence rule. Extracted as a pure resolver so
 * the rule has its own characterization spec.
 *
 * **Precedence (highest to lowest):**
 *   1. Caller-supplied `requestedContactId` (explicit override)
 *   2. The expected payment item's assigned `contactId`
 *   3. The trip's `primaryContactId`
 *
 * Returns `null` when none of the three are present. The caller decides
 * whether null is acceptable for the operation in question — this resolver
 * does NOT throw on missing data, but it also does NOT silently invent a
 * fallback (no logger.warn + return undefined; the caller MUST handle null
 * explicitly).
 *
 * **Error mode: strict.** The resolver itself is pure — no DB, no I/O. It
 * cannot fail. The caller's DB lookups for the input fields may fail, and
 * those errors propagate normally. NO `try*` prefix because this class
 * does not swallow anything.
 */
import { Injectable } from '@nestjs/common'

export interface ResolvePaymentContactInput {
  /** Explicit override from the API request body. Takes priority. */
  requestedContactId?: string | null
  /** The expected payment item's per-installment contact assignment. */
  expectedItemContactId?: string | null
  /** The trip's primary contact, as fallback. */
  tripPrimaryContactId?: string | null
}

@Injectable()
export class PaymentContactResolver {
  /**
   * Apply the precedence chain to pick the contact ID for a payment
   * transaction.
   *
   * Returns the first non-empty value in this order:
   *   requestedContactId > expectedItemContactId > tripPrimaryContactId
   *
   * Returns null when all three are empty.
   */
  resolve(input: ResolvePaymentContactInput): string | null {
    if (input.requestedContactId) return input.requestedContactId
    if (input.expectedItemContactId) return input.expectedItemContactId
    if (input.tripPrimaryContactId) return input.tripPrimaryContactId
    return null
  }
}
