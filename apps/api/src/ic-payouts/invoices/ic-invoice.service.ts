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
  Logger,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { sql, eq, and } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { IcInvoiceNumberAllocator } from './ic-invoice-number-allocator.service'
import { PlaceOfSupplyService } from '../place-of-supply/place-of-supply.service'
import { IcInvoicePdfService } from './ic-invoice-pdf.service'
import { StorageService } from '../../trips/storage.service'
import type { SubmitClaimInput } from './dto/submit-claim.dto'

const {
  icTaxProfiles,
  commissionChecks,
  icInvoices,
  icInvoiceLines,
} = schema

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
    }

    return { invoices }
  }

  // ============================================================================
  // PUBLIC: approve
  // ============================================================================

  async approve(invoiceId: string, approverUserId: string): Promise<IcInvoice> {
    return this.db.client.transaction(async (tx) => {
      // Atomically flip status submitted → approved (WHERE guard prevents double-approve)
      const [invoice] = await tx
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

      if (!invoice) {
        throw new BadRequestException('Invoice not in submitted state or does not exist')
      }

      // Flip the reservation paid check to 'accepted'
      if (invoice.reservationCheckId) {
        await tx
          .update(commissionChecks)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(commissionChecks.id, invoice.reservationCheckId))
          .returning()
      }

      return invoice
    })
  }

  // ============================================================================
  // PUBLIC: reject
  // ============================================================================

  async reject(
    invoiceId: string,
    reason: string,
    rejectorUserId: string,
  ): Promise<IcInvoice> {
    return this.db.client.transaction(async (tx) => {
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

    // 5. PDF rendering OUTSIDE the transaction.
    //    The reservation is committed. PDF failure must never roll it back.
    try {
      // Fetch lines for PDF context
      const lines = await this.db.client
        .select()
        .from(icInvoiceLines)
        .where(eq(icInvoiceLines.invoiceId, committedInvoice.id))

      const pdfBytes = await this.pdf.render({
        invoice: committedInvoice,
        lines,
        icLegalName: args.profile.legalName,
        icAddress: args.profile.domicileAddress as Record<string, unknown>,
        icGstHstNumber: args.profile.gstHstNumber ?? null,
        icSinOrBnMask: args.profile.sinOrBnMask ?? null,
      })

      const componentId = `ic-payouts/invoices/${args.agencyId}/${args.userId}`
      const pdfStoragePath = await this.storage.uploadDocument(
        pdfBytes,
        componentId,
        `${committedInvoice.invoiceNumber}.pdf`,
        'application/pdf',
      )

      const pdfHash = createHash('sha256').update(pdfBytes).digest('hex')

      // Update invoice with PDF metadata (best-effort — failure here is non-fatal)
      await this.db.client
        .update(icInvoices)
        .set({ pdfStoragePath, pdfHash, updatedAt: new Date() })
        .where(eq(icInvoices.id, committedInvoice.id))
        .returning()

      return { ...committedInvoice, pdfStoragePath, pdfHash }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `PDF render/upload failed for invoice ${committedInvoice.id} (${committedInvoice.invoiceNumber}): ${message}. ` +
        `Invoice remains committed in 'submitted' state without PDF. Re-trigger via admin endpoint.`,
      )
      // Return invoice WITHOUT pdf fields — reservation is still intact
      return committedInvoice
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
