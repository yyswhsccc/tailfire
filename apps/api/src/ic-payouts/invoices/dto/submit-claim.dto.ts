/**
 * SubmitClaimDto
 *
 * Input DTO for IcInvoiceService.submitClaim.
 * The IC selects which commission_check_items they want to include in this
 * invoice submission. All pending adjustments for the same currency are
 * automatically included.
 */

import { IsArray, IsUUID, ArrayMinSize } from 'class-validator'
import { z } from 'zod'

export class SubmitClaimDto {
  /** IDs of commission_check_items to include in this invoice. */
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  selectedCheckItemIds!: string[]
}

export interface SubmitClaimInput {
  agencyId: string
  /** IC the claim belongs to. The invoice's user_id is set to this value. */
  userId: string
  /**
   * Present only when an admin is submitting on behalf of the IC. Used to
   * record the actual actor in the audit event without overwriting the
   * invoice's user_id.
   */
  submittedByAdminUserId?: string
  selectedCheckItemIds: string[]
}

// ── Zod schemas (used by IcInvoiceController with zodValidation pipe) ─────────

export const submitClaimSchema = z.object({
  selectedCheckItemIds: z.array(z.string().uuid()).min(1),
})
export type SubmitClaimZodDto = z.infer<typeof submitClaimSchema>

export const rejectInvoiceSchema = z.object({
  reason: z.string().min(1).max(2000),
})
export type RejectInvoiceDto = z.infer<typeof rejectInvoiceSchema>

export const cancelInvoiceSchema = z.object({
  reason: z.string().min(1).max(2000),
})
export type CancelInvoiceDto = z.infer<typeof cancelInvoiceSchema>
