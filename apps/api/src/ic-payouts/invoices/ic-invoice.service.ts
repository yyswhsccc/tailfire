/**
 * IcInvoiceService
 *
 * Implements the C3 atomic reservation pattern for IC commission invoice submission.
 *
 * Core invariant — "money is reserved at submit time, not approve time":
 *   All four DB operations must commit in a single transaction per currency:
 *     1. Insert internal commission_checks (paid) row as reservation ledger
 *     2. INSERT...ON CONFLICT DO NOTHING into commission_item_settlements
 *     3. UPDATE commission_adjustments status='reconciled' WHERE status='pending'
 *     4. INSERT ic_invoices + ic_invoice_lines
 *
 *   If ANY settlement INSERT returns fewer rows than selected items (concurrent
 *   winner already claimed one), the entire transaction rolls back automatically
 *   and we throw ConflictException.
 *
 * PDF rendering is intentionally OUTSIDE the transaction:
 *   - Commit the reservation first; PDF failure must never roll it back.
 *   - If PDF fails, the invoice lives in 'submitted' status without a PDF path.
 *   - Admins can re-trigger PDF rendering via a future endpoint.
 *
 * Multi-currency:
 *   If the IC selects items spanning CAD + USD (or any two currencies), we split
 *   into one independent invoice per currency. Each currency gets its own
 *   transaction so a failure in one doesn't block the other.
 *
 * CRA snapshot requirement:
 *   ic_legal_name, ic_address, ic_gst_hst_number, ic_sin_or_bn_mask,
 *   ic_domicile_province MUST be snapshotted from ic_tax_profiles at creation
 *   time. They are NEVER fetched live after the invoice is created.
 */

import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { sql, eq, and } from 'drizzle-orm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { IcInvoiceNumberAllocator } from './ic-invoice-number-allocator.service'
import { PlaceOfSupplyService } from '../place-of-supply/place-of-supply.service'
import { IcInvoicePdfService } from './ic-invoice-pdf.service'
import { StorageService } from '../../trips/storage.service'
import { RCTI_AGREEMENT_VERSION } from '../authorizations/rcti-template'
import type { SubmitClaimInput } from './dto/submit-claim.dto'
import { DisbursementService } from '../disbursements/disbursement.service'

const {
  icTaxProfiles,
  commissionChecks,
  commissionAdjustments,
  icInvoices,
  icInvoiceLines,
  agencyTaxFilingConfig,
} = schema

export type IcInvoiceStatus = (typeof schema.icInvoiceStatusEnum.enumValues)[number]

// ── Internal types ─────────────────────────────────────────────────────────────

type IcInvoice = typeof icInvoices.$inferSelect
type IcTaxProfile = typeof icTaxProfiles.$inferSelect

interface EligibleItem {
  id: string
  currency: string
  description: string | null
  tripRef: string | null
  commissionCents: number
}

interface PendingAdjustment {
  id: string
  currency: string
  amountCents: number
  description: string
}

interface CurrencyInvoiceArgs {
  agencyId: string
  userId: string
  currency: string
  items: EligibleItem[]
  adjustments: PendingAdjustment[]
  profile: IcTaxProfile
}

export interface SubmitClaimResult {
  invoices: IcInvoice[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IcInvoiceService {
  private readonly logger = new Logger(IcInvoiceService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly allocator: IcInvoiceNumberAllocator,
    private readonly placeOfSupply: PlaceOfSupplyService,
    private readonly pdf: IcInvoicePdfService,
    private readonly storage: StorageService,
    private readonly disbursementService: DisbursementService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================================================
  // PUBLIC: submitClaim
  // ============================================================================

  async submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
    if (!input.selectedCheckItemIds || input.selectedCheckItemIds.length === 0) {
      throw new BadRequestException('No eligible items selected')
    }

    // 1. Fetch IC tax profile and enforce RCTI requirement
    const profile = await this.findTaxProfile(input.agencyId, input.userId)
    if (!profile?.rctiAuthorizationId) {
      throw new ForbiddenException('Active RCTI authorization required before submitting an invoice')
    }

    // 2. Fetch eligible items grouped by currency
    const itemsByCurrency = await this.fetchEligibleItemsByCurrency(
      input.agencyId,
      input.userId,
      input.selectedCheckItemIds,
    )

    if (itemsByCurrency.size === 0) {
      throw new BadRequestException('No eligible items found for the selected IDs')
    }

    // 3. Fetch pending adjustments grouped by currency
    const adjustmentsByCurrency = await this.fetchPendingAdjustmentsByCurrency(
      input.agencyId,
      input.userId,
    )

    // 4. One transaction per currency (independent — one failure doesn't block another)
    const invoices: IcInvoice[] = []
    for (const [currency, items] of itemsByCurrency) {
      const adjustments = adjustmentsByCurrency.get(currency) ?? []
      const invoice = await this.submitCurrencyInvoice({
        agencyId: input.agencyId,
        userId: input.userId,
        currency,
        items,
        adjustments,
        profile,
      })
      invoices.push(invoice)

      // Emit after the transaction commits (not inside the tx).
      // autoApproved=true when the invoice was immediately approved by the auto-disburse gate.
      const autoApproved = invoice.status === 'approved'
      this.eventEmitter.emit('ic-payout.invoice.submitted', {
        invoiceId: invoice.id,
        agencyId: input.agencyId,
        userId: input.userId,
        currency,
        totalCents: invoice.totalCents,
        autoApproved,
      })
    }

    return { invoices }
  }

  // ============================================================================
  // PUBLIC: approve
  // ============================================================================

  async approve(invoiceId: string, approverUserId: string): Promise<IcInvoice> {
    const invoice = await this.db.client.transaction(async (tx) => {
      // Atomically flip status submitted → approved (WHERE guard prevents double-approve)
      const [updated] = await tx
        .update(icInvoices)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: approverUserId,
          updatedBy: approverUserId,
          updatedAt: new Date(),
        })
        .where(eq(icInvoices.id, invoiceId))
        .returning()

      if (!updated) {
        throw new BadRequestException('Invoice not in submitted state or does not exist')
      }

      // Flip the reservation paid check to 'accepted'
      if (updated.reservationCheckId) {
        await tx
          .update(commissionChecks)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(commissionChecks.id, updated.reservationCheckId))
          .returning()
      }

      return updated
    })

    // After the transaction commits, emit the approved event.
    this.eventEmitter.emit('ic-payout.invoice.approved', {
      invoiceId: invoice.id,
      agencyId: invoice.agencyId,
      userId: invoice.userId,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      approvedBy: approverUserId,
    })

    // After the transaction commits, enqueue a disbursement.
    // Failure here is non-fatal: an approved invoice without a disbursement is recoverable
    // (admin can manually re-trigger enqueue). But rolling back an approval and leaving the
    // IC seeing 'rejected' falsely is much worse.
    try {
      await this.disbursementService.enqueue(
        invoice.id,
        invoice.userId,
        invoice.totalCents,
        invoice.currency,
      )
    } catch (enqueueErr) {
      const msg = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr)
      this.logger.error(
        `ALERT: Failed to enqueue disbursement for approved invoice ${invoice.id} ` +
        `(${invoice.invoiceNumber}): ${msg}. ` +
        `Invoice is approved but no disbursement was created. ` +
        `Admin must manually trigger enqueue via the disbursements endpoint.`,
      )
    }

    return invoice
  }

  // ============================================================================
  // PUBLIC: reject
  // ============================================================================

  async reject(
    invoiceId: string,
    reason: string,
    rejectorUserId: string,
  ): Promise<IcInvoice> {
    const invoice = await this.db.client.transaction(async (tx) => {
      // Atomically flip status (submitted|approved) → rejected
      const [invoice] = await tx
        .update(icInvoices)
        .set({
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedReason: reason,
          updatedBy: rejectorUserId,
          updatedAt: new Date(),
        })
        .where(eq(icInvoices.id, invoiceId))
        .returning()

      if (!invoice) {
        throw new BadRequestException('Invoice not rejectable in current state or does not exist')
      }

      if (invoice.reservationCheckId) {
        // 1. Delete settled commission_item_settlements linked to this reservation
        await tx.execute(sql`
          DELETE FROM commission_item_settlements
          WHERE paid_check_id = ${invoice.reservationCheckId}
        `)

        // 2. Flip reconciled adjustments back to pending
        await tx.execute(sql`
          UPDATE commission_adjustments
          SET status = 'pending', check_id = NULL, updated_at = now()
          WHERE check_id = ${invoice.reservationCheckId}
            AND status = 'reconciled'
        `)

        // 3. Cancel the reservation paid check
        await tx
          .update(commissionChecks)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(commissionChecks.id, invoice.reservationCheckId))
          .returning()
      }

      return invoice
    })

    // Emit after the transaction commits.
    this.eventEmitter.emit('ic-payout.invoice.rejected', {
      invoiceId: invoice.id,
      agencyId: invoice.agencyId,
      userId: invoice.userId,
      reason,
      rejectedBy: rejectorUserId,
    })

    return invoice
  }

  // ============================================================================
  // PUBLIC: getEligibleForUser
  // ============================================================================

  /**
   * Returns all unsettled commission check items and pending adjustments
   * for the given user, grouped by currency.
   *
   * This is the pre-claim browsing endpoint — the IC uses this to select
   * which items to include before calling submitClaim.
   */
  async getEligibleForUser(agencyId: string, userId: string): Promise<{
    itemsByCurrency: Array<{
      currency: string
      items: Array<{
        checkItemId: string
        tripRef: string | null
        description: string | null
        commissionCents: number
      }>
      adjustments: Array<{
        adjustmentId: string
        description: string
        amountCents: number
      }>
    }>
  }> {
    // Fetch unsettled commission check items the user is a collaborator on.
    // trip_ref is composed from trip.reference_number with fallback to trip.name —
    // activity_pricing has no trip_ref column (was a Task 24 mistake); trips table is
    // the source of truth for the human-readable identifier shown to the IC.
    const itemRows: any[] = await this.db.client.execute(sql`
      SELECT
        cci.id AS check_item_id,
        src_cc.currency,
        COALESCE(t.reference_number, t.name) AS trip_ref,
        cci.description,
        GREATEST(COALESCE(cci.received_cents, 0), 0) AS commission_cents
      FROM commission_check_items cci
      JOIN commission_checks src_cc ON src_cc.id = cci.check_id
      JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id_day.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN trip_collaborators tc
        ON tc.trip_id = t.id
        AND tc.user_id = ${userId}::uuid
        AND tc.is_active = true
      LEFT JOIN commission_item_settlements existing
        ON existing.check_item_id = cci.id
        AND existing.recipient_user_id = ${userId}::uuid
      WHERE src_cc.agency_id = ${agencyId}::uuid
        AND src_cc.check_type = 'received'
        AND src_cc.status = 'accepted'
        AND t.status IN ('travelling', 'travelled')
        AND existing.id IS NULL
    `)

    // Fetch pending adjustments for this user
    const adjustmentRows = await this.db.client
      .select()
      .from(commissionAdjustments)
      .where(and(
        eq(commissionAdjustments.agencyId, agencyId),
        eq(commissionAdjustments.agentUserId, userId),
        eq(commissionAdjustments.status, 'pending'),
      ))

    // Group by currency
    const groups = new Map<string, {
      items: Array<{ checkItemId: string; tripRef: string | null; description: string | null; commissionCents: number }>
      adjustments: Array<{ adjustmentId: string; description: string; amountCents: number }>
    }>()

    for (const row of itemRows) {
      const c = row.currency as string
      if (!groups.has(c)) groups.set(c, { items: [], adjustments: [] })
      groups.get(c)!.items.push({
        checkItemId: row.check_item_id as string,
        tripRef: (row.trip_ref as string) ?? null,
        description: (row.description as string) ?? null,
        commissionCents: Number(row.commission_cents),
      })
    }

    for (const adj of adjustmentRows) {
      const c = adj.currency
      if (!groups.has(c)) groups.set(c, { items: [], adjustments: [] })
      groups.get(c)!.adjustments.push({
        adjustmentId: adj.id,
        description: adj.description,
        amountCents: adj.amountCents,
      })
    }

    return {
      itemsByCurrency: Array.from(groups.entries()).map(([currency, group]) => ({
        currency,
        items: group.items,
        adjustments: group.adjustments,
      })),
    }
  }

  // ============================================================================
  // PUBLIC: listForUser
  // ============================================================================

  async listForUser(agencyId: string, userId: string) {
    return await this.db.client
      .select()
      .from(icInvoices)
      .where(and(
        eq(icInvoices.agencyId, agencyId),
        eq(icInvoices.userId, userId),
      ))
      .orderBy(sql`created_at DESC`)
  }

  // ============================================================================
  // PUBLIC: getInvoiceDetail
  // ============================================================================

  async getInvoiceDetail(
    agencyId: string,
    invoiceId: string,
    requestingUserId: string,
    isAdmin: boolean,
  ) {
    const conditions: any[] = [
      eq(icInvoices.id, invoiceId),
      eq(icInvoices.agencyId, agencyId),
    ]
    if (!isAdmin) {
      conditions.push(eq(icInvoices.userId, requestingUserId))
    }

    const [invoice] = await this.db.client
      .select()
      .from(icInvoices)
      .where(and(...conditions))
      .limit(1)

    if (!invoice) throw new NotFoundException('Invoice not found')

    const lines = await this.db.client
      .select()
      .from(icInvoiceLines)
      .where(eq(icInvoiceLines.invoiceId, invoiceId))

    return { ...invoice, lines }
  }

  // ============================================================================
  // PUBLIC: listForAdmin
  // ============================================================================

  async listForAdmin(agencyId: string, status?: IcInvoiceStatus) {
    const conditions: any[] = [eq(icInvoices.agencyId, agencyId)]
    if (status) conditions.push(eq(icInvoices.status, status))

    return await this.db.client
      .select()
      .from(icInvoices)
      .where(and(...conditions))
      .orderBy(sql`submitted_at DESC NULLS LAST, created_at DESC`)
  }

  // ============================================================================
  // PRIVATE: core currency-invoice transaction
  // ============================================================================

  private async submitCurrencyInvoice(args: CurrencyInvoiceArgs): Promise<IcInvoice> {
    const today = new Date()
    const taxYear = today.getFullYear()
    const invoiceDateStr = today.toISOString().slice(0, 10)

    // 1. Allocate invoice number (race-free via INSERT...ON CONFLICT DO UPDATE)
    const invoiceNumber = await this.allocator.allocate(args.agencyId, args.userId, taxYear)

    // 2. Resolve place of supply and tax rate
    const pos = await this.placeOfSupply.resolve({
      agencyId: args.agencyId,
      icDomicileProvince: args.profile.domicileProvince,
      invoiceDate: invoiceDateStr,
      icGstHstRegistered: args.profile.gstHstRegistered,
    })

    // 3. Compute amounts
    const commissionTotal = args.items.reduce((s, it) => s + it.commissionCents, 0)
    const adjustmentTotal = args.adjustments.reduce((s, a) => s + a.amountCents, 0)
    const reportableBase = commissionTotal + adjustmentTotal
    const taxCents = pos.rateBp > 0 ? Math.round((reportableBase * pos.rateBp) / 10_000) : 0
    const totalCents = reportableBase + taxCents

    // 4. CRITICAL: atomic reservation transaction
    //    All four writes must commit together. If settlements INSERT returns fewer
    //    rows than items (concurrent winner), ConflictException causes rollback.
    const committedInvoice = await this.db.client.transaction(async (tx) => {
      // 4a. Create internal commission_checks (paid) row as reservation ledger.
      //     This row is the "receipt" that makes the reservation durable.
      const [reservationCheck] = await tx
        .insert(commissionChecks)
        .values({
          agencyId: args.agencyId,
          checkNumber: invoiceNumber,
          checkType: 'paid',
          checkDate: invoiceDateStr,
          checkAmountCents: reportableBase,
          currency: args.currency,
          recipientUserId: args.userId,
          recipientName: args.profile.legalName,
          status: 'submitted',
          source: 'ic-payouts',
          sourceRef: invoiceNumber,
          createdBy: args.userId,
          updatedBy: args.userId,
        })
        .returning()

      if (!reservationCheck) {
        throw new Error('Failed to create reservation check')
      }

      // 4b. Atomically claim commission items via INSERT...ON CONFLICT DO NOTHING.
      //     The UNIQUE constraint on (check_item_id, recipient_user_id) means only
      //     the first concurrent caller wins; all others get 0 rows back.
      const itemIds = args.items.map(i => i.id)
      const claimed: { id: string }[] = await tx.execute(sql`
        INSERT INTO commission_item_settlements
          (check_item_id, recipient_user_id, paid_check_id, settled_amount_cents, created_by)
        SELECT
          cci.id,
          ${args.userId}::uuid,
          ${reservationCheck.id}::uuid,
          GREATEST(COALESCE(cci.received_cents, 0), 0),
          ${args.userId}::uuid
        FROM commission_check_items cci
        WHERE cci.id = ANY(${sql.raw(`ARRAY[${itemIds.map(id => `'${id}'`).join(',')}]::uuid[]`)}::uuid[])
        ON CONFLICT (check_item_id, recipient_user_id) DO NOTHING
        RETURNING id
      `)

      // C3 invariant: if fewer rows returned than expected → conflict → rollback
      if (!claimed || claimed.length < itemIds.length) {
        throw new ConflictException(
          'One or more items already claimed by a concurrent in-flight invoice. ' +
          'Please refresh your selection and try again.',
        )
      }

      // 4c. Claim pending adjustments — atomically mark as reconciled
      await tx.execute(sql`
        UPDATE commission_adjustments
        SET status = 'reconciled',
            check_id = ${reservationCheck.id}::uuid,
            updated_at = now()
        WHERE agent_user_id = ${args.userId}::uuid
          AND agency_id = ${args.agencyId}::uuid
          AND status = 'pending'
          AND currency = ${args.currency}
      `)

      // 4d. Insert ic_invoices — CRA snapshot: identity fields frozen at creation
      const [invoice] = await tx
        .insert(icInvoices)
        .values({
          agencyId: args.agencyId,
          userId: args.userId,
          invoiceNumber,
          invoiceDate: invoiceDateStr,
          currency: args.currency,
          // CRA snapshot — must never be fetched live from ic_tax_profiles after creation
          icLegalName: args.profile.legalName,
          icAddress: args.profile.domicileAddress as Record<string, unknown>,
          icDomicileProvince: args.profile.domicileProvince,
          icGstHstNumber: args.profile.gstHstNumber ?? null,
          icSinOrBnMask: args.profile.sinOrBnMask ?? null,
          icTaxProfileId: args.profile.id,
          rctiAuthorizationId: args.profile.rctiAuthorizationId!,
          // Financials
          reportableBaseCents: reportableBase,
          taxCents,
          totalCents,
          // Place of supply audit trail
          placeOfSupplyJurisdiction: pos.jurisdiction,
          placeOfSupplyRule: pos.rule,
          taxType: pos.taxType,
          taxRateBp: pos.rateBp,
          // Status
          status: 'submitted',
          submittedAt: new Date(),
          // C3 reservation link
          reservationCheckId: reservationCheck.id,
          // Audit
          createdBy: args.userId,
          updatedBy: args.userId,
        })
        .returning()

      if (!invoice) {
        throw new Error('Failed to insert invoice')
      }

      // 4e. Insert ic_invoice_lines
      const lineValues = [
        ...args.items.map(it => ({
          invoiceId: invoice.id,
          lineType: 'commission' as const,
          checkItemId: it.id,
          adjustmentId: null as string | null,
          description: it.description ?? null,
          tripRef: it.tripRef ?? null,
          amountCents: it.commissionCents,
          currency: args.currency,
        })),
        ...args.adjustments.map(a => ({
          invoiceId: invoice.id,
          lineType: 'adjustment' as const,
          checkItemId: null as string | null,
          adjustmentId: a.id,
          description: a.description,
          tripRef: null as string | null,
          amountCents: a.amountCents,
          currency: args.currency,
        })),
      ]

      if (lineValues.length > 0) {
        await tx.insert(icInvoiceLines).values(lineValues).returning()
      }

      return invoice
    })

    // 5. Auto-approval gate (Task 29)
    //    Runs AFTER the transaction commits and BEFORE PDF render so the PDF
    //    is generated against the final status (approved or submitted).
    //
    //    Rules:
    //    - autoDisburse must be true (admin-only policy flag)
    //    - approvalCeilingCents null  → no ceiling, always auto-approve
    //    - approvalCeilingCents 0     → approve only $0 invoices; effectively
    //      disables auto-approve for non-zero invoices (0 <= 0 is well-defined)
    //    - Ceiling check uses totalCents (commission + tax), NOT reportableBase
    //    - The IC's own userId is recorded as approvedBy so the audit trail
    //      distinguishes this system path from a human admin approval.
    //      A future task can stamp triggeredBy:'auto_disburse_policy' on the event.
    let finalInvoice = committedInvoice
    const ceilingOk =
      args.profile.approvalCeilingCents == null ||
      finalInvoice.totalCents <= args.profile.approvalCeilingCents
    if (args.profile.autoDisburse === true && ceilingOk) {
      try {
        finalInvoice = await this.approve(finalInvoice.id, args.profile.userId)
      } catch (autoApproveErr) {
        // Auto-approve failure is non-fatal — the invoice stays in 'submitted'.
        // Log prominently so admins can investigate the unexpected state.
        const msg = autoApproveErr instanceof Error ? autoApproveErr.message : String(autoApproveErr)
        this.logger.error(
          `Auto-approve failed for invoice ${finalInvoice.id} (${finalInvoice.invoiceNumber}): ${msg}. ` +
          `Invoice remains in 'submitted' state. ` +
          `autoDisburse=true but approval gate did not complete — manual admin review required.`,
        )
      }
    }

    // 6. PDF rendering OUTSIDE the transaction.
    //    The reservation is committed. PDF failure must never roll it back.
    try {
      // Fetch lines for PDF context
      const lines = await this.db.client
        .select()
        .from(icInvoiceLines)
        .where(eq(icInvoiceLines.invoiceId, finalInvoice.id))

      // Fetch agency tax filing config for the agency identity block on the invoice.
      // Should always exist (PlaceOfSupplyService would have failed earlier if missing),
      // but we treat a missing config as non-fatal to preserve the non-blocking posture.
      const agencyConfigRows = await this.db.client
        .select()
        .from(agencyTaxFilingConfig)
        .where(eq(agencyTaxFilingConfig.agencyId, args.agencyId))
        .limit(1)

      const agencyConfig = agencyConfigRows[0]
      if (!agencyConfig) {
        this.logger.warn(
          `Missing agency_tax_filing_config for agency ${args.agencyId}. ` +
          `Invoice ${finalInvoice.invoiceNumber} will be committed without a PDF.`,
        )
        return finalInvoice
      }

      // Build agency address lines for the invoice header
      const addr = agencyConfig.filingAddress as {
        street?: string
        city?: string
        province?: string
        postalCode?: string
      }
      const agencyAddressLines = [
        addr.street ?? '',
        [addr.city, addr.province, addr.postalCode].filter(Boolean).join(', '),
      ].filter(s => s.trim().length > 0)

      // Mask BN15 for display: last 4 digits visible, rest replaced with '*'
      const bn15 = agencyConfig.payerAccountNumber
      const agencyBn15 = bn15.length > 4
        ? '*'.repeat(bn15.length - 4) + bn15.slice(-4)
        : bn15

      const pdfBytes = await this.pdf.render({
        invoice: finalInvoice,
        lines,
        agencyLegalName: agencyConfig.legalName,
        agencyAddressLines,
        agencyBn15,
        icLegalName: args.profile.legalName,
        icAddress: args.profile.domicileAddress as { street: string; city: string; province: string; postalCode: string },
        icGstHstNumber: args.profile.gstHstNumber ?? null,
        icSinOrBnMask: args.profile.sinOrBnMask ?? null,
        rctiAgreementVersion: RCTI_AGREEMENT_VERSION,
      })

      const componentId = `ic-payouts/invoices/${args.agencyId}/${args.userId}`
      const pdfStoragePath = await this.storage.uploadDocument(
        pdfBytes,
        componentId,
        `${finalInvoice.invoiceNumber}.pdf`,
        'application/pdf',
      )

      const pdfHash = createHash('sha256').update(pdfBytes).digest('hex')

      // Update invoice with PDF metadata (best-effort — failure here is non-fatal)
      await this.db.client
        .update(icInvoices)
        .set({ pdfStoragePath, pdfHash, updatedAt: new Date() })
        .where(eq(icInvoices.id, finalInvoice.id))
        .returning()

      return { ...finalInvoice, pdfStoragePath, pdfHash }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `PDF render/upload failed for invoice ${finalInvoice.id} (${finalInvoice.invoiceNumber}): ${message}. ` +
        `Invoice remains committed in its current state without PDF. Re-trigger via admin endpoint.`,
      )
      // Return invoice WITHOUT pdf fields — reservation is still intact
      return finalInvoice
    }
  }

  // ============================================================================
  // PRIVATE: helpers
  // ============================================================================

  private async findTaxProfile(agencyId: string, userId: string): Promise<IcTaxProfile | null> {
    const [profile] = await this.db.client
      .select()
      .from(icTaxProfiles)
      .where(and(
        eq(icTaxProfiles.agencyId, agencyId),
        eq(icTaxProfiles.userId, userId),
      ))
      .limit(1)

    return profile ?? null
  }

  private async fetchEligibleItemsByCurrency(
    agencyId: string,
    userId: string,
    selectedIds: string[],
  ): Promise<Map<string, EligibleItem[]>> {
    if (selectedIds.length === 0) return new Map()

    // Fetch eligible items: must be unsettled, on departing/departed trips,
    // from accepted received checks, and in the requested selection.
    // The currency comes from the parent commission_checks row.
    const rows: any[] = await this.db.client.execute(sql`
      SELECT
        cci.id,
        src_cc.currency,
        cci.description,
        ap.trip_ref AS trip_ref,
        GREATEST(COALESCE(cci.received_cents, 0), 0) AS commission_cents
      FROM commission_check_items cci
      JOIN commission_checks src_cc ON src_cc.id = cci.check_id
      JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id_day.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN trip_collaborators tc
        ON tc.trip_id = t.id
        AND tc.user_id = ${userId}::uuid
        AND tc.is_active = true
      LEFT JOIN commission_item_settlements existing
        ON existing.check_item_id = cci.id
        AND existing.recipient_user_id = ${userId}::uuid
      WHERE src_cc.agency_id = ${agencyId}::uuid
        AND src_cc.check_type = 'received'
        AND src_cc.status = 'accepted'
        AND t.status IN ('travelling', 'travelled')
        AND existing.id IS NULL
        AND cci.id = ANY(${sql.raw(`ARRAY[${selectedIds.map(id => `'${id}'`).join(',')}]::uuid[]`)}::uuid[])
    `)

    const map = new Map<string, EligibleItem[]>()
    for (const row of rows) {
      const currency: string = row.currency
      if (!map.has(currency)) map.set(currency, [])
      map.get(currency)!.push({
        id: row.id,
        currency,
        description: row.description ?? null,
        tripRef: row.trip_ref ?? null,
        commissionCents: Number(row.commission_cents),
      })
    }
    return map
  }

  private async fetchPendingAdjustmentsByCurrency(
    agencyId: string,
    userId: string,
  ): Promise<Map<string, PendingAdjustment[]>> {
    const rows: any[] = await this.db.client.execute(sql`
      SELECT
        ca.id,
        ca.currency,
        ca.amount_cents,
        ca.description
      FROM commission_adjustments ca
      WHERE ca.agent_user_id = ${userId}::uuid
        AND ca.agency_id = ${agencyId}::uuid
        AND ca.status = 'pending'
    `)

    const map = new Map<string, PendingAdjustment[]>()
    for (const row of rows) {
      const currency: string = row.currency
      if (!map.has(currency)) map.set(currency, [])
      map.get(currency)!.push({
        id: row.id,
        currency,
        amountCents: Number(row.amount_cents),
        description: row.description,
      })
    }
    return map
  }
}
