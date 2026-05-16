/**
 * Commission Service
 *
 * Business logic for commission check management:
 * - CRUD for commission checks (received from suppliers, paid to agents)
 * - Reconciliation (adding/removing bookings to checks)
 * - Status transitions (pending → submitted → accepted; recall for edits)
 * - Per-activity commission tracking (upsert/update)
 * - Agent payout calculation
 * - Dashboard summary
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import { eq, and, desc, sql, between, inArray, count } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { CommissionSettlementReversalService } from './commission-settlement-reversal.service'
import { VALID_CHECK_TRANSITIONS } from './commission.types'
import type {
  CreateCommissionCheckDto,
  UpdateCommissionCheckDto,
  CommissionCheckResponseDto,
  CommissionCheckFilterDto,
  PaginatedCommissionChecksResponseDto,
  CommissionCheckSummaryDto,
  AddCheckItemDto,
  CommissionCheckItemResponseDto,
  UpsertActivityCommissionDto,
  UpdateActivityCommissionDto,
  ActivityCommissionResponseDto,
  AgentCommissionDueDto,
  PayAgentDto,
  CommissionSummaryResponseDto,
  CommissionCheckStatus,
  PendingReceivablesFilterDto,
  PendingReceivablesResponseDto,
  PendingReceivableDto,
  CreateDepositDto,
  FinalizeDepositDto,
  DepositDetailResponseDto,
  CreateHistoricalPaidCheckDto,
  HistoricalPaidCheckResponseDto,
} from './commission.types'

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly settlementReversalService: CommissionSettlementReversalService,
  ) {}

  // ============================================================================
  // CHECK CRUD
  // ============================================================================

  async createCheck(
    agencyId: string,
    dto: CreateCommissionCheckDto,
    userId?: string
  ): Promise<CommissionCheckResponseDto> {
    // Validate sender/recipient based on check type
    if (dto.checkType === 'received' && !dto.senderName && !dto.senderSupplierId) {
      throw new BadRequestException('Received checks must have a sender (senderName or senderSupplierId)')
    }
    if (dto.checkType === 'paid' && !dto.recipientName && !dto.recipientUserId) {
      throw new BadRequestException('Paid checks must have a recipient (recipientName or recipientUserId)')
    }

    // Validate senderSupplierId exists before inserting (FK constraint protection)
    let validSupplierId = dto.senderSupplierId ?? null
    if (validSupplierId) {
      const [supplier] = await this.db.client
        .select({ id: this.db.schema.suppliers.id })
        .from(this.db.schema.suppliers)
        .where(eq(this.db.schema.suppliers.id, validSupplierId))
        .limit(1)
      if (!supplier) {
        this.logger.warn(`Supplier ${validSupplierId} not found — clearing senderSupplierId, keeping senderName`)
        validSupplierId = null
      }
    }

    const [check] = await this.db.client
      .insert(this.db.schema.commissionChecks)
      .values({
        agencyId,
        checkNumber: dto.checkNumber,
        checkType: dto.checkType,
        checkDate: dto.checkDate,
        checkAmountCents: dto.checkAmountCents,
        currency: dto.currency ?? 'CAD',
        senderName: dto.senderName,
        senderSupplierId: validSupplierId,
        recipientName: dto.recipientName,
        recipientUserId: dto.recipientUserId,
        groupCheck: dto.groupCheck ?? false,
        parentCheckId: dto.parentCheckId,
        payrollId: dto.payrollId,
        notes: dto.notes,
        source: dto.source ?? 'manual',
        sourceRef: dto.sourceRef,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    return this.formatCheck(check)
  }

  async getChecks(
    agencyId: string,
    filter: CommissionCheckFilterDto
  ): Promise<PaginatedCommissionChecksResponseDto> {
    const page = filter.page ?? 1
    const limit = filter.limit ?? 50
    const offset = (page - 1) * limit

    const conditions = [eq(this.db.schema.commissionChecks.agencyId, agencyId)]

    if (filter.checkType) {
      conditions.push(eq(this.db.schema.commissionChecks.checkType, filter.checkType))
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      conditions.push(inArray(this.db.schema.commissionChecks.status, statuses))
    }

    if (filter.dateFrom && filter.dateTo) {
      const from = filter.dateFrom
      const to = filter.dateTo
      conditions.push(
        between(this.db.schema.commissionChecks.checkDate, from, to)
      )
    }

    if (filter.senderSupplierId) {
      conditions.push(
        eq(this.db.schema.commissionChecks.senderSupplierId, filter.senderSupplierId)
      )
    }

    if (filter.recipientUserId) {
      conditions.push(
        eq(this.db.schema.commissionChecks.recipientUserId, filter.recipientUserId)
      )
    }

    const whereClause = and(...conditions)

    const [checks, countResult] = await Promise.all([
      this.db.client
        .select()
        .from(this.db.schema.commissionChecks)
        .where(whereClause)
        .orderBy(desc(this.db.schema.commissionChecks.checkDate))
        .limit(limit)
        .offset(offset),
      this.db.client
        .select({ total: count() })
        .from(this.db.schema.commissionChecks)
        .where(whereClause),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      data: checks.map((c) => this.formatCheck(c)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async getCheckDetail(
    agencyId: string,
    checkId: string
  ): Promise<CommissionCheckResponseDto> {
    const check = await this.getCheckRecord(agencyId, checkId)

    const [items, adjustments] = await Promise.all([
      this.db.client
        .select()
        .from(this.db.schema.commissionCheckItems)
        .where(eq(this.db.schema.commissionCheckItems.checkId, checkId))
        .orderBy(desc(this.db.schema.commissionCheckItems.createdAt)),
      this.db.client
        .select()
        .from(this.db.schema.commissionAdjustments)
        .where(eq(this.db.schema.commissionAdjustments.checkId, checkId))
        .orderBy(desc(this.db.schema.commissionAdjustments.createdAt)),
    ])

    const formattedItems = items.map((i) => this.formatCheckItem(i))
    const totalItemsCents = items.reduce((sum, i) => sum + (i.receivedCents ?? 0), 0)
    const totalAdjustmentsCents = adjustments.reduce((sum, a) => sum + a.amountCents, 0)
    const reconciledTotal = totalItemsCents + totalAdjustmentsCents

    const summary: CommissionCheckSummaryDto = {
      totalItemsCents,
      totalAdjustmentsCents,
      reconciledTotal,
      unreconciledCents: check.checkAmountCents - reconciledTotal,
    }

    return {
      ...this.formatCheck(check),
      items: formattedItems,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        checkId: a.checkId,
        agencyId: a.agencyId,
        description: a.description,
        amountCents: a.amountCents,
        adjustmentType: a.adjustmentType,
        taxType: a.taxType,
        taxRate: a.taxRate,
        agentUserId: a.agentUserId,
        companyName: a.companyName,
        status: a.status,
        source: a.source,
        sourceRef: a.sourceRef,
        createdBy: a.createdBy,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      summary,
    }
  }

  async updateCheck(
    agencyId: string,
    checkId: string,
    dto: UpdateCommissionCheckDto,
    userId?: string
  ): Promise<CommissionCheckResponseDto> {
    const check = await this.getCheckRecord(agencyId, checkId)

    // Validate status transition if status is being changed
    if (dto.status && dto.status !== check.status) {
      this.validateTransition(check.status, dto.status)
    } else if (check.status === 'accepted' || check.status === 'cancelled') {
      throw new BadRequestException(`Cannot update check in '${check.status}' status`)
    }

    if (dto.senderSupplierId) {
      await this.assertSupplierBelongsToAgency(agencyId, dto.senderSupplierId)
    }

    // If cancelling a paid check, reverse settlements and adjustments atomically
    const isCancellingPaidCheck =
      dto.status === 'cancelled' && check.checkType === 'paid'

    if (isCancellingPaidCheck) {
      // PR-1: replaces prior `DELETE FROM commission_item_settlements` — the
      // settlements are reversed via paired negation rows so the original
      // financial history is preserved forever (audit-proof pillar).
      const reason = dto.notes?.trim() || `Paid check ${check.checkNumber} cancelled`
      const actor = userId ?? check.createdBy ?? check.agencyId

      const [updated] = await this.db.client.transaction(async (tx) => {
        await this.settlementReversalService.reverseAllByPaidCheck(
          {
            paidCheckId: checkId,
            reason,
            actorUserId: actor,
            agencyId,
          },
          tx,
        )

        // Revert reconciled adjustments back to pending
        await tx.execute(sql`
          UPDATE commission_adjustments
          SET status = 'pending', check_id = NULL, updated_at = now()
          WHERE check_id = ${checkId} AND status = 'reconciled'
        `)

        // Update the check status
        return tx
          .update(this.db.schema.commissionChecks)
          .set({
            ...dto,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.commissionChecks.id, checkId))
          .returning()
      })

      return this.formatCheck(updated)
    }

    const [updated] = await this.db.client
      .update(this.db.schema.commissionChecks)
      .set({
        ...dto,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.commissionChecks.id, checkId))
      .returning()

    return this.formatCheck(updated)
  }

  // ============================================================================
  // STATUS TRANSITIONS
  // ============================================================================

  async acceptCheck(agencyId: string, checkId: string, userId?: string): Promise<CommissionCheckResponseDto> {
    const check = await this.getCheckRecord(agencyId, checkId)
    this.validateTransition(check.status, 'accepted')

    const [updated] = await this.db.client
      .update(this.db.schema.commissionChecks)
      .set({
        status: 'accepted',
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.commissionChecks.id, checkId))
      .returning()

    return this.formatCheck(updated)
  }

  async recallCheck(
    agencyId: string,
    checkId: string,
    userId?: string,
    reason?: string,
  ): Promise<CommissionCheckResponseDto> {
    const check = await this.getCheckRecord(agencyId, checkId)

    if (check.status !== 'accepted') {
      throw new BadRequestException('Only accepted checks can be recalled')
    }

    // PR-1: recall is a signed transition that unlocks the immutability
    // trigger added in migration 20260516100700. Reason is required so the
    // audit trail can explain why the financial identity was reopened.
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException(
        'recallCheck requires a reason — it unlocks the accepted-check immutability guard.',
      )
    }

    const newNotes = check.notes
      ? `${check.notes}\n[Recall ${new Date().toISOString()}] ${reason}`
      : `[Recall ${new Date().toISOString()}] ${reason}`

    const [updated] = await this.db.client
      .update(this.db.schema.commissionChecks)
      .set({
        status: 'submitted',
        notes: newNotes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.commissionChecks.id, checkId))
      .returning()

    return this.formatCheck(updated)
  }

  // ============================================================================
  // HISTORICAL PAID CHECK (TES cutover backfill — P1.C)
  // ============================================================================
  //
  // Atomically creates a paid commission_checks row (status='accepted') AND
  // the corresponding commission_item_settlements rows, preserving historical
  // settlement state at TES → TF cutover so getCommissionDue() does not
  // surface already-paid TES commissions as still-owed to agents.
  //
  // Codex-validated design (2026-05-15):
  // - settled_amount_cents preserves TES Commission.Paid (NOT re-derived via
  //   current split/tax formula — that would rewrite history)
  // - idempotent via (source, sourceRef) match → 409 with existing check id
  // - settlements use ON CONFLICT (check_item_id, recipient_user_id) DO NOTHING
  //   so re-running the backfill is safe
  //
  // See docs/runbooks/tes-cutover-backfill-plan.md#p1c-historical-paid-settlement-endpoint

  async createHistoricalPaidCheck(
    agencyId: string,
    dto: CreateHistoricalPaidCheckDto,
    userId?: string
  ): Promise<HistoricalPaidCheckResponseDto> {
    if (!dto.settlements || dto.settlements.length === 0) {
      throw new BadRequestException('settlements must contain at least one row')
    }

    // Reject duplicate checkItemIds in input — same (checkItem, recipient) pair
    // would be a caller bug (can only resolve to one settlement under the unique
    // constraint anyway).
    const seenItems = new Set<string>()
    for (const s of dto.settlements) {
      if (seenItems.has(s.checkItemId)) {
        throw new BadRequestException(
          `Duplicate checkItemId in settlements: ${s.checkItemId}`
        )
      }
      seenItems.add(s.checkItemId)
      if (s.settledAmountCents < 0) {
        throw new BadRequestException(
          `settledAmountCents must be ≥ 0 (checkItemId=${s.checkItemId})`
        )
      }
    }

    // Idempotency: if a paid check with the same (source, sourceRef) already
    // exists for this agency, reject with the existing id so callers can use
    // it instead of creating a duplicate.
    if (dto.sourceRef) {
      const [existing] = await this.db.client
        .select({ id: this.db.schema.commissionChecks.id })
        .from(this.db.schema.commissionChecks)
        .where(
          and(
            eq(this.db.schema.commissionChecks.agencyId, agencyId),
            eq(this.db.schema.commissionChecks.checkType, 'paid'),
            eq(this.db.schema.commissionChecks.source, dto.source),
            eq(this.db.schema.commissionChecks.sourceRef, dto.sourceRef)
          )
        )
        .limit(1)
      if (existing) {
        throw new ConflictException({
          message: 'Historical paid check already exists for this (source, sourceRef)',
          existingCheckId: existing.id,
        })
      }
    }

    // Validate all check_items belong to the same agency (cross-agency leak guard).
    const checkItemIds = dto.settlements.map((s) => s.checkItemId)
    const reachableItems = await this.db.client
      .select({ id: this.db.schema.commissionCheckItems.id })
      .from(this.db.schema.commissionCheckItems)
      .innerJoin(
        this.db.schema.commissionChecks,
        eq(this.db.schema.commissionCheckItems.checkId, this.db.schema.commissionChecks.id)
      )
      .where(
        and(
          inArray(this.db.schema.commissionCheckItems.id, checkItemIds),
          eq(this.db.schema.commissionChecks.agencyId, agencyId)
        )
      )

    if (reachableItems.length !== checkItemIds.length) {
      const found = new Set(reachableItems.map((r) => r.id))
      const missing = checkItemIds.filter((id) => !found.has(id))
      throw new NotFoundException(
        `commission_check_items not found in this agency: ${missing.join(', ')}`
      )
    }

    const totalCents = dto.settlements.reduce((sum, s) => sum + s.settledAmountCents, 0)

    // Atomic insert: paid check + N settlements.
    const result = await this.db.client.transaction(async (tx) => {
      const [check] = await tx
        .insert(this.db.schema.commissionChecks)
        .values({
          agencyId,
          checkNumber: dto.checkNumber,
          checkType: 'paid',
          checkDate: dto.checkDate,
          checkAmountCents: totalCents,
          currency: dto.currency,
          recipientUserId: dto.recipientUserId,
          recipientName: dto.recipientName,
          status: 'accepted', // Historical → already settled
          source: dto.source,
          sourceRef: dto.sourceRef,
          notes: dto.notes,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()

      if (!check) {
        throw new BadRequestException('Failed to create historical paid check')
      }

      const settlementRows = dto.settlements.map((s) => ({
        checkItemId: s.checkItemId,
        recipientUserId: dto.recipientUserId,
        paidCheckId: check.id,
        settledAmountCents: s.settledAmountCents,
        createdBy: userId,
      }))

      // PR-1 Commit 12: the partial unique on commission_item_settlements is
      // now `(check_item_id, recipient_user_id) WHERE is_reversal = false
      // AND reversed_at IS NULL` — see migration 20260516210000. Drizzle's
      // onConflictDoNothing() in this version does not expose the partial
      // index predicate, so we drop down to raw SQL to target the partial
      // unique correctly. Same idempotent semantics as before.
      const inserted: { id: string }[] = []
      for (const row of settlementRows) {
        const [maybe] = await tx.execute<{ id: string }>(sql`
          INSERT INTO commission_item_settlements
            (check_item_id, recipient_user_id, paid_check_id, settled_amount_cents, created_by)
          VALUES
            (${row.checkItemId}::uuid, ${row.recipientUserId}::uuid,
             ${row.paidCheckId}::uuid, ${row.settledAmountCents}, ${row.createdBy ?? null})
          ON CONFLICT (check_item_id, recipient_user_id)
            WHERE is_reversal = false AND reversed_at IS NULL
            DO NOTHING
          RETURNING id
        `)
        if (maybe?.id) inserted.push({ id: maybe.id })
      }

      return {
        check,
        settlementCount: inserted.length,
        duplicateCount: dto.settlements.length - inserted.length,
      }
    })

    return {
      ...this.formatCheck(result.check),
      settlementCount: result.settlementCount,
      duplicateCount: result.duplicateCount,
    }
  }

  // ============================================================================
  // CHECK ITEMS (RECONCILIATION)
  // ============================================================================

  async addCheckItem(
    agencyId: string,
    checkId: string,
    dto: AddCheckItemDto
  ): Promise<CommissionCheckItemResponseDto> {
    // Verify check exists and belongs to agency
    const check = await this.getCheckRecord(agencyId, checkId)

    // PR-1 immutability guard: once accepted, items cannot be added.
    // Recall (accepted → pending) is the only way to unlock.
    if (check.status === 'accepted') {
      throw new BadRequestException(
        `commission_check ${checkId} is accepted and locked. Recall before adding items.`,
      )
    }
    if (check.status === 'cancelled') {
      throw new BadRequestException(
        `commission_check ${checkId} is cancelled. Cannot add items to a cancelled check.`,
      )
    }

    // Verify activity pricing belongs to same agency
    const [pricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.id, dto.activityPricingId),
          eq(this.db.schema.activityPricing.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!pricing) {
      throw new NotFoundException(`Activity pricing ${dto.activityPricingId} not found`)
    }

    // PR-1: resolve embedded_tax fields. Caller wins; otherwise derive from
    // supplier defaults via the formula helper (embedded = gross × rate /
    // (100 + rate) when commission_includes_tax = true).
    const tax = await this.resolveCheckItemTax(
      dto.activityPricingId,
      dto.receivedCents ?? 0,
      {
        embeddedTaxCents: dto.embeddedTaxCents,
        embeddedTaxType: dto.embeddedTaxType,
        embeddedTaxRatePercent: dto.embeddedTaxRatePercent,
      },
    )

    const [item] = await this.db.client
      .insert(this.db.schema.commissionCheckItems)
      .values({
        checkId,
        activityPricingId: dto.activityPricingId,
        projectedCents: dto.projectedCents,
        receivedParentCents: dto.receivedParentCents ?? 0,
        receivedCents: dto.receivedCents ?? 0,
        embeddedTaxCents: tax.embeddedTaxCents,
        embeddedTaxType: tax.embeddedTaxType,
        embeddedTaxRatePercent: tax.embeddedTaxRatePercent != null ? String(tax.embeddedTaxRatePercent) : null,
      })
      .returning()

    return this.formatCheckItem(item)
  }

  /**
   * PR-1: resolves embedded-tax inputs for a new commission_check_item.
   * Caller-supplied values always win. When omitted, looks up the supplier
   * via the activity_pricing → itinerary_activities → activity_suppliers
   * chain (or activity_pricing.supplierName fallback) and applies the
   * formula. Returns { embeddedTaxCents, embeddedTaxType, embeddedTaxRatePercent }.
   */
  private async resolveCheckItemTax(
    activityPricingId: string,
    grossCents: number,
    callerSupplied: {
      embeddedTaxCents?: number
      embeddedTaxType?: string | null
      embeddedTaxRatePercent?: number | null
    },
  ): Promise<{
    embeddedTaxCents: number
    embeddedTaxType: string | null
    embeddedTaxRatePercent: number | null
  }> {
    // Caller wins entirely — no derivation when they supplied anything.
    if (callerSupplied.embeddedTaxCents !== undefined) {
      return {
        embeddedTaxCents: callerSupplied.embeddedTaxCents,
        embeddedTaxType: callerSupplied.embeddedTaxType ?? null,
        embeddedTaxRatePercent: callerSupplied.embeddedTaxRatePercent ?? null,
      }
    }

    // Look up supplier defaults via activity_suppliers (most authoritative)
    // with a fallback to activity_pricing.supplier (denormalized name).
    const rows: any[] = await this.db.client.execute(sql`
      SELECT
        s.default_commission_tax_type AS tax_type,
        s.default_commission_tax_rate_percent::numeric AS rate_percent,
        s.commission_includes_tax AS includes_tax
      FROM activity_pricing ap
      LEFT JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN activity_suppliers asup ON asup.activity_id = ia.id AND asup.primary_supplier = true
      LEFT JOIN suppliers s ON s.id = asup.supplier_id
      WHERE ap.id = ${activityPricingId}::uuid
      LIMIT 1
    `)
    const row = (rows as Array<{ tax_type?: string | null; rate_percent?: string | null; includes_tax?: boolean | null }>)[0]
    const ratePercent = row?.rate_percent != null ? Number(row.rate_percent) : null
    const includesTax = !!row?.includes_tax

    if (!includesTax || ratePercent === null || ratePercent === 0) {
      return { embeddedTaxCents: 0, embeddedTaxType: row?.tax_type ?? null, embeddedTaxRatePercent: ratePercent }
    }

    // Lazy import to avoid a wider service refactor for one helper.
    const { computeEmbeddedTaxFromInclusive } = await import('./commission-formula')
    return {
      embeddedTaxCents: computeEmbeddedTaxFromInclusive(grossCents, ratePercent),
      embeddedTaxType: row?.tax_type ?? null,
      embeddedTaxRatePercent: ratePercent,
    }
  }

  async removeCheckItem(
    agencyId: string,
    checkId: string,
    itemId: string
  ): Promise<{ success: boolean }> {
    const check = await this.getCheckRecord(agencyId, checkId)

    // PR-1 immutability guard: items on accepted checks must be reversed,
    // not deleted. Recall the check to unlock removal during correction.
    if (check.status === 'accepted') {
      throw new BadRequestException(
        `commission_check ${checkId} is accepted and locked. Recall before removing items.`,
      )
    }

    const [deleted] = await this.db.client
      .delete(this.db.schema.commissionCheckItems)
      .where(
        and(
          eq(this.db.schema.commissionCheckItems.id, itemId),
          eq(this.db.schema.commissionCheckItems.checkId, checkId)
        )
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException(`Check item ${itemId} not found on check ${checkId}`)
    }

    return { success: true }
  }

  // ============================================================================
  // PER-ACTIVITY COMMISSION
  // ============================================================================

  async upsertActivityCommission(
    agencyId: string,
    activityPricingId: string,
    dto: UpsertActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    // Verify activity pricing exists and belongs to agency
    const [pricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.id, activityPricingId),
          eq(this.db.schema.activityPricing.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!pricing) {
      throw new NotFoundException(`Activity pricing ${activityPricingId} not found`)
    }

    const netCommissionCents = dto.grossCommissionCents - (dto.taxAmountCents ?? 0)

    // Legacy field compatibility
    const commissionAmount = (dto.grossCommissionCents / 100).toFixed(2)

    // Auto-calculate platform fee from agency settings (or trip-level override)
    // Resolve tripId from activity_pricing → itinerary_activities → itinerary_days → itineraries → trip
    const tripResult: any[] = await this.db.client.execute(sql`
      SELECT i.trip_id
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id ON id.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      WHERE ap.id = ${activityPricingId}
      LIMIT 1
    `)
    const tripId = tripResult[0]?.trip_id ?? null

    // Fetch agency commission fee rate
    const [agencySettingsRow] = await this.db.client
      .select({ commissionFeeRate: this.db.schema.agencySettings.commissionFeeRate })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    let feeRate = parseFloat(agencySettingsRow?.commissionFeeRate || '5.00')

    // Check for trip-level override
    if (tripId) {
      const [trip] = await this.db.client
        .select({ override: this.db.schema.trips.commissionFeeRateOverride })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)
      if (trip?.override) feeRate = parseFloat(trip.override)
    }

    const platformFeeCents = Math.round(netCommissionCents * feeRate / 100)

    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.commissionTracking)
      .where(eq(this.db.schema.commissionTracking.activityPricingId, activityPricingId))
      .limit(1)

    if (existing) {
      // Update existing
      const [updated] = await this.db.client
        .update(this.db.schema.commissionTracking)
        .set({
          grossCommissionCents: dto.grossCommissionCents,
          taxAmountCents: dto.taxAmountCents ?? 0,
          taxType: dto.taxType,
          netCommissionCents,
          platformFeeCents,
          commissionRate: dto.commissionRate?.toString(),
          commissionAmount,
          source: dto.source ?? 'manual',
          sourceBookingRef: dto.sourceBookingRef,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.commissionTracking.id, existing.id))
        .returning()

      return this.formatCommissionTracking(updated)
    }

    // Create new
    const [created] = await this.db.client
      .insert(this.db.schema.commissionTracking)
      .values({
        activityPricingId,
        grossCommissionCents: dto.grossCommissionCents,
        taxAmountCents: dto.taxAmountCents ?? 0,
        taxType: dto.taxType,
        netCommissionCents,
        platformFeeCents,
        commissionRate: dto.commissionRate?.toString(),
        commissionAmount,
        commissionStatus: 'pending',
        source: dto.source ?? 'manual',
        sourceBookingRef: dto.sourceBookingRef,
      })
      .returning()

    return this.formatCommissionTracking(created)
  }

  async getActivityCommission(
    agencyId: string,
    activityPricingId: string
  ): Promise<ActivityCommissionResponseDto> {
    // Verify activity pricing belongs to agency
    const [pricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.id, activityPricingId),
          eq(this.db.schema.activityPricing.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!pricing) {
      throw new NotFoundException(`Activity pricing ${activityPricingId} not found`)
    }

    const [tracking] = await this.db.client
      .select()
      .from(this.db.schema.commissionTracking)
      .where(eq(this.db.schema.commissionTracking.activityPricingId, activityPricingId))
      .limit(1)

    if (!tracking) {
      throw new NotFoundException(`Commission tracking not found for activity pricing ${activityPricingId}`)
    }

    return this.formatCommissionTracking(tracking)
  }

  async updateActivityCommission(
    agencyId: string,
    activityPricingId: string,
    dto: UpdateActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    // Verify activity pricing belongs to agency
    const [pricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.id, activityPricingId),
          eq(this.db.schema.activityPricing.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!pricing) {
      throw new NotFoundException(`Activity pricing ${activityPricingId} not found`)
    }

    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.commissionTracking)
      .where(eq(this.db.schema.commissionTracking.activityPricingId, activityPricingId))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Commission tracking not found for activity pricing ${activityPricingId}`)
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (dto.receivedCents !== undefined) updateData.receivedCents = dto.receivedCents
    if (dto.paidCents !== undefined) updateData.paidCents = dto.paidCents
    if (dto.adjustmentCents !== undefined) updateData.adjustmentCents = dto.adjustmentCents
    if (dto.receivedParentCents !== undefined) updateData.receivedParentCents = dto.receivedParentCents
    if (dto.platformFeeCents !== undefined) updateData.platformFeeCents = dto.platformFeeCents
    if (dto.commissionStatus !== undefined) {
      updateData.commissionStatus = dto.commissionStatus
      // Legacy field sync
      if (dto.commissionStatus === 'received') {
        updateData.commissionStatus = 'received'
      }
    }

    const [updated] = await this.db.client
      .update(this.db.schema.commissionTracking)
      .set(updateData)
      .where(eq(this.db.schema.commissionTracking.id, existing.id))
      .returning()

    return this.formatCommissionTracking(updated)
  }

  // ============================================================================
  // AGENT PAYOUTS
  // ============================================================================

  async getCommissionDue(agencyId: string, scopeUserId?: string): Promise<AgentCommissionDueDto[]> {
    // Calculate commissions due per (agent, currency) from accepted received checks.
    // Each (userId, currency) pair becomes a separate row — a single agent can appear
    // multiple times if they have unsettled items in different currencies.
    //
    // Formula (two-stage split):
    //   distributable = received_cents - tax - platform_fee
    //   agent_portion = distributable * agent_split_rate / 100  (default 60%)
    //   individual_payout = agent_portion * collaborator_percentage / 100
    //
    // Adjustments are matched by currency so that CAD adjustments only appear in the
    // CAD row and USD adjustments only in the USD row.
    const result: any[] = await this.db.client.execute(sql`
      SELECT
        up.id AS user_id,
        cc.currency,
        COALESCE(up.first_name || ' ' || up.last_name, up.email) AS user_name,
        COUNT(DISTINCT cci.activity_pricing_id) AS booking_count,
        COALESCE(SUM(
          ROUND(
            (cci.received_cents - COALESCE(ct.tax_amount_cents, 0) - COALESCE(ct.platform_fee_cents, 0))
            * COALESCE((up.commission_settings->>'splitValue')::numeric, 60) / 100
            * tc.commission_percentage / 100
          )
        ), 0) AS commission_due_cents,
        COALESCE(
          (SELECT SUM(ca.amount_cents)
           FROM commission_adjustments ca
           WHERE ca.agent_user_id = up.id
             AND ca.agency_id = ${agencyId}
             AND ca.status = 'pending'
             AND ca.currency = cc.currency),
          0
        ) AS adjustments_cents
      FROM commission_checks cc
      JOIN commission_check_items cci ON cci.check_id = cc.id
      JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      LEFT JOIN commission_tracking ct ON ct.component_pricing_id = cci.activity_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id ON id.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN trip_collaborators tc ON tc.trip_id = t.id AND tc.is_active = true
      JOIN user_profiles up ON up.id = tc.user_id
      -- PR-1 Commit 13 (Codex round-5 fix): an "active settlement" is one
      -- that hasn't been reversed. Without the is_reversal/reversed_at
      -- filter, reversed items would stay hidden from getCommissionDue()
      -- forever — the cis row still exists, just marked reversed.
      LEFT JOIN commission_item_settlements cis
        ON cis.check_item_id = cci.id
        AND cis.recipient_user_id = up.id
        AND cis.is_reversal = false
        AND cis.reversed_at IS NULL
      WHERE cc.agency_id = ${agencyId}
        AND cc.check_type = 'received'
        AND cc.status = 'accepted'
        AND cis.id IS NULL
        AND t.status IN ('travelling', 'travelled')
        -- Filter out the admin fixture (TES import seeds it as a
        -- co-collaborator on every imported trip; it should never appear
        -- as an agent earning commission). The real human admins use
        -- their own user accounts when also doing agent work.
        AND up.email <> 'admin@phoenixvoyages.ca'
        ${scopeUserId ? sql`AND up.id = ${scopeUserId}` : sql``}
      GROUP BY up.id, up.first_name, up.last_name, up.email, up.commission_settings, cc.currency
    `)

    return result.map((row: any) => ({
      userId: row.user_id,
      userName: row.user_name,
      currency: row.currency,
      bookingCount: Number(row.booking_count),
      commissionDueCents: Number(row.commission_due_cents),
      adjustmentsCents: Number(row.adjustments_cents),
      totalDueCents: Number(row.commission_due_cents) + Number(row.adjustments_cents),
    }))
  }

  async payAgents(
    agencyId: string,
    dto: PayAgentDto,
    userId?: string
  ): Promise<CommissionCheckResponseDto[]> {
    const dueList = await this.getCommissionDue(agencyId)
    const toPay = dueList.filter((d) => dto.userIds.includes(d.userId))

    if (toPay.length === 0) {
      throw new BadRequestException('No eligible agents found for payment')
    }

    const checkDate = dto.checkDate ?? new Date().toISOString().split('T')[0]!
    const prefix = dto.checkNumberPrefix ?? 'PAY'

    // Wrap all payments in a transaction with atomic settlement claims
    const results = await this.db.client.transaction(async (tx) => {
      const txResults: CommissionCheckResponseDto[] = []

      for (const agent of toPay) {
        // Include currency in the check number so concurrent (userId, currency) pairs
        // in the same batch don't collide on the timestamp component.
        const checkNumber = `${prefix}-${Date.now()}-${agent.userId.slice(0, 8)}-${agent.currency}`

        // Step 1: Create placeholder paid check with amount=0, using the agent's currency.
        // One paid check is created per (userId, currency) pair — not just per userId.
        const [check] = await tx
          .insert(this.db.schema.commissionChecks)
          .values({
            agencyId,
            checkNumber,
            checkType: 'paid',
            checkDate,
            checkAmountCents: 0,
            currency: agent.currency,   // ← was hardcoded 'CAD'
            recipientUserId: agent.userId,
            recipientName: agent.userName,
            status: 'submitted',
            source: 'system',
            createdBy: userId,
            updatedBy: userId,
          })
          .returning()

        if (!check) {
          throw new BadRequestException(`Failed to create payment check for ${agent.userName}`)
        }

        // Step 2: Atomically claim unsettled items via INSERT ... ON CONFLICT DO NOTHING RETURNING.
        // Filtered to source received checks whose currency matches this agent row's currency,
        // ensuring that CAD items are only claimed into a CAD paid check and USD into USD.
        const claimedRows: { settled_amount_cents: number }[] = await tx.execute(sql`
          INSERT INTO commission_item_settlements
            (check_item_id, recipient_user_id, paid_check_id, settled_amount_cents, created_by)
          SELECT
            cci.id,
            ${agent.userId},
            ${check.id},
            GREATEST(ROUND(
              (cci.received_cents - COALESCE(ct.tax_amount_cents, 0) - COALESCE(ct.platform_fee_cents, 0))
              * COALESCE((up.commission_settings->>'splitValue')::numeric, 60) / 100
              * tc.commission_percentage / 100
            ), 0),
            ${userId}
          FROM commission_check_items cci
          JOIN commission_checks src_cc ON src_cc.id = cci.check_id
          JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
          LEFT JOIN commission_tracking ct ON ct.component_pricing_id = cci.activity_pricing_id
          JOIN itinerary_activities ia ON ia.id = ap.activity_id
          JOIN itinerary_days id ON id.id = ia.itinerary_day_id
          JOIN itineraries i ON i.id = id.itinerary_id
          JOIN trips t ON t.id = i.trip_id
          JOIN trip_collaborators tc ON tc.trip_id = t.id AND tc.user_id = ${agent.userId} AND tc.is_active = true
          JOIN user_profiles up ON up.id = tc.user_id
          -- PR-1 Commit 12: only "active" settlements block re-claim. A
          -- reversed original (reversed_at IS NOT NULL) or a reversal row
          -- (is_reversal = true) is not active.
          LEFT JOIN commission_item_settlements existing
            ON existing.check_item_id = cci.id
            AND existing.recipient_user_id = ${agent.userId}
            AND existing.is_reversal = false
            AND existing.reversed_at IS NULL
          WHERE existing.id IS NULL
            AND t.status IN ('travelling', 'travelled')
            AND src_cc.agency_id = ${agencyId}
            AND src_cc.check_type = 'received'
            AND src_cc.status = 'accepted'
            AND src_cc.currency = ${agent.currency}   -- ← only claim items in matching currency
          ON CONFLICT (check_item_id, recipient_user_id) WHERE is_reversal = false AND reversed_at IS NULL DO NOTHING
          RETURNING settled_amount_cents
        `)

        // Step 3: Sum claimed cents
        const claimedCents = claimedRows.reduce(
          (sum, row) => sum + Number(row.settled_amount_cents),
          0
        )

        // Step 4: Atomically claim pending adjustments via UPDATE...RETURNING.
        // Filtered by currency so CAD adjustments are only claimed into the CAD paid check.
        const claimedAdjustments: { amount_cents: number }[] = await tx.execute(sql`
          UPDATE commission_adjustments
          SET status = 'reconciled', check_id = ${check.id}, updated_at = now()
          WHERE agent_user_id = ${agent.userId}
            AND agency_id = ${agencyId}
            AND status = 'pending'
            AND currency = ${agent.currency}   -- ← only reconcile matching currency
          RETURNING amount_cents
        `)
        const adjustmentsCents = claimedAdjustments.reduce(
          (sum, row) => sum + Number(row.amount_cents),
          0
        )

        // Step 5: Calculate total
        const totalCents = claimedCents + adjustmentsCents

        // Step 6: If nothing claimed, revert adjustments and delete placeholder
        if (totalCents <= 0) {
          // Revert adjustments before deleting check to avoid ON DELETE CASCADE data loss
          await tx.execute(sql`
            UPDATE commission_adjustments
            SET status = 'pending', check_id = NULL, updated_at = now()
            WHERE check_id = ${check.id} AND status = 'reconciled'
          `)
          await tx
            .delete(this.db.schema.commissionChecks)
            .where(eq(this.db.schema.commissionChecks.id, check.id))
          continue
        }

        // Step 7: Update paid check with actual amount
        const [updatedCheck] = await tx
          .update(this.db.schema.commissionChecks)
          .set({
            checkAmountCents: totalCents,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.commissionChecks.id, check.id))
          .returning()

        txResults.push(this.formatCheck(updatedCheck))
      }

      return txResults
    })

    return results
  }

  // ============================================================================
  // DASHBOARD SUMMARY
  // ============================================================================

  async getCommissionSummary(agencyId: string, scopeUserId?: string): Promise<CommissionSummaryResponseDto> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]!
    const today = now.toISOString().split('T')[0]!

    // When scoped to a specific user (non-admin), filter to checks/sales on trips
    // where the user is an active collaborator
    if (scopeUserId) {
      const scopedResult: any[] = await this.db.client.execute(sql`
        WITH user_trips AS (
          SELECT tc.trip_id
          FROM trip_collaborators tc
          WHERE tc.user_id = ${scopeUserId} AND tc.is_active = true
        ),
        user_check_items AS (
          SELECT cci.check_id, cci.received_cents
          FROM commission_check_items cci
          JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
          JOIN itinerary_activities ia ON ia.id = ap.activity_id
          JOIN itinerary_days id ON id.id = ia.itinerary_day_id
          JOIN itineraries i ON i.id = id.itinerary_id
          WHERE i.trip_id IN (SELECT trip_id FROM user_trips)
        )
        SELECT
          COALESCE((
            SELECT SUM(cc.check_amount_cents)
            FROM commission_checks cc
            WHERE cc.agency_id = ${agencyId}
              AND cc.check_type = 'received'
              AND cc.status = 'accepted'
              AND cc.check_date >= ${monthStart}::date AND cc.check_date <= ${today}::date
              AND cc.id IN (SELECT check_id FROM user_check_items)
          ), 0) AS commission_mtd,
          COALESCE((
            SELECT SUM(cc.check_amount_cents)
            FROM commission_checks cc
            WHERE cc.agency_id = ${agencyId}
              AND cc.check_type = 'received'
              AND cc.status = 'accepted'
              AND cc.check_date >= ${yearStart}::date AND cc.check_date <= ${today}::date
              AND cc.id IN (SELECT check_id FROM user_check_items)
          ), 0) AS commission_ytd,
          COALESCE((
            SELECT SUM(ap.total_price_cents)
            FROM activity_pricing ap
            JOIN itinerary_activities ia ON ia.id = ap.activity_id
            JOIN itinerary_days id ON id.id = ia.itinerary_day_id
            JOIN itineraries i ON i.id = id.itinerary_id
            WHERE ap.agency_id = ${agencyId}
              AND ap.created_at >= ${monthStart}::date
              AND i.trip_id IN (SELECT trip_id FROM user_trips)
          ), 0) AS sales_mtd,
          COALESCE((
            SELECT SUM(ap.total_price_cents)
            FROM activity_pricing ap
            JOIN itinerary_activities ia ON ia.id = ap.activity_id
            JOIN itinerary_days id ON id.id = ia.itinerary_day_id
            JOIN itineraries i ON i.id = id.itinerary_id
            WHERE ap.agency_id = ${agencyId}
              AND ap.created_at >= ${yearStart}::date
              AND i.trip_id IN (SELECT trip_id FROM user_trips)
          ), 0) AS sales_ytd
      `)

      const row = scopedResult[0] ?? {}
      return {
        salesMtdCents: Number(row.sales_mtd ?? 0),
        salesYtdCents: Number(row.sales_ytd ?? 0),
        commissionReceivedMtdCents: Number(row.commission_mtd ?? 0),
        commissionReceivedYtdCents: Number(row.commission_ytd ?? 0),
      }
    }

    const mtdResults = await this.db.client
      .select({ total: sql<number>`COALESCE(SUM(check_amount_cents), 0)` })
      .from(this.db.schema.commissionChecks)
      .where(
        and(
          eq(this.db.schema.commissionChecks.agencyId, agencyId),
          eq(this.db.schema.commissionChecks.checkType, 'received'),
          eq(this.db.schema.commissionChecks.status, 'accepted'),
          sql`check_date >= ${monthStart}::date AND check_date <= ${today}::date`
        )
      )

    const ytdResults = await this.db.client
      .select({ total: sql<number>`COALESCE(SUM(check_amount_cents), 0)` })
      .from(this.db.schema.commissionChecks)
      .where(
        and(
          eq(this.db.schema.commissionChecks.agencyId, agencyId),
          eq(this.db.schema.commissionChecks.checkType, 'received'),
          eq(this.db.schema.commissionChecks.status, 'accepted'),
          sql`check_date >= ${yearStart}::date AND check_date <= ${today}::date`
        )
      )

    // Sales: sum of activity pricing total_price_cents for the agency
    const salesMtdResults = await this.db.client
      .select({ total: sql<number>`COALESCE(SUM(total_price_cents), 0)` })
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.agencyId, agencyId),
          sql`created_at >= ${monthStart}::date`
        )
      )

    const salesYtdResults = await this.db.client
      .select({ total: sql<number>`COALESCE(SUM(total_price_cents), 0)` })
      .from(this.db.schema.activityPricing)
      .where(
        and(
          eq(this.db.schema.activityPricing.agencyId, agencyId),
          sql`created_at >= ${yearStart}::date`
        )
      )

    return {
      salesMtdCents: Number(salesMtdResults[0]?.total ?? 0),
      salesYtdCents: Number(salesYtdResults[0]?.total ?? 0),
      commissionReceivedMtdCents: Number(mtdResults[0]?.total ?? 0),
      commissionReceivedYtdCents: Number(ytdResults[0]?.total ?? 0),
    }
  }

  // ============================================================================
  // PENDING RECEIVABLES (Commission Receive Deposit UI)
  // ============================================================================

  async getPendingReceivables(
    agencyId: string,
    filters: PendingReceivablesFilterDto = {}
  ): Promise<PendingReceivablesResponseDto> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 50
    const offset = (page - 1) * limit
    const statusFilter = filters.status ?? 'pending'

    // Build parameterized WHERE conditions (no string interpolation)
    const conditions: ReturnType<typeof sql>[] = [
      sql`ap.agency_id = ${agencyId}`,
      sql`ap.commission_total_cents > 0`,
    ]

    if (statusFilter === 'pending') {
      conditions.push(sql`(ct.id IS NULL OR ct.commission_status = 'pending')`)
    }

    if (filters.supplierId) {
      // Two ways an activity can be tied to a supplier:
      //
      //   1. activity_suppliers.supplier_id (FK — the proper way)
      //   2. activity_pricing.supplier (legacy free-text)
      //
      // Many TES-imported pending receivables only have the free-text
      // value populated (no FK row). Filtering on (1) alone would
      // silently return zero rows even when the supplier obviously has
      // pending commission — exactly what #333 reported for Sunwing.
      //
      // Match by FK OR by the supplier's canonical name, scoped to the
      // selected supplier_id so we don't accidentally widen to other
      // suppliers with similar names.
      conditions.push(sql`(
        asup.supplier_id = ${filters.supplierId}
        OR ap.supplier = (SELECT name FROM suppliers WHERE id = ${filters.supplierId})
      )`)
    }

    if (filters.departureDateFrom) {
      conditions.push(sql`t.start_date >= ${filters.departureDateFrom}::date`)
    }

    if (filters.departureDateTo) {
      conditions.push(sql`t.start_date <= ${filters.departureDateTo}::date`)
    }

    // Search filter uses parameterized ILIKE
    const searchPattern = filters.search ? `%${filters.search}%` : null
    if (searchPattern) {
      conditions.push(sql`(
        ia.confirmation_number ILIKE ${searchPattern}
        OR ap.booking_reference ILIKE ${searchPattern}
        OR t.name ILIKE ${searchPattern}
        OR EXISTS (
          SELECT 1 FROM trip_travelers tt_s
          JOIN contacts c_s ON c_s.id = tt_s.contact_id
          WHERE tt_s.trip_id = t.id
            AND (c_s.first_name || ' ' || c_s.last_name) ILIKE ${searchPattern}
        )
      )`)
    }

    // Combine conditions with AND
    const whereClause = conditions.reduce((acc, cond, i) =>
      i === 0 ? cond : sql`${acc} AND ${cond}`
    )

    // Main query — fully parameterized
    const dataQuery = sql`
      WITH receivables AS (
        SELECT DISTINCT ON (ap.id)
          ap.id AS activity_pricing_id,
          ia.confirmation_number,
          ap.booking_reference,
          ap.supplier AS supplier_name,
          asup.supplier_id,
          t.name AS trip_name,
          t.id AS trip_id,
          t.start_date AS trip_start_date,
          id_day.date::text AS activity_start_date,
          ia.name AS activity_name,
          ap.commission_total_cents AS expected_commission_cents,
          ct.commission_status,
          ct.reconciliation_date,
          ct.reconciled_by,
          owner.first_name AS owner_first_name,
          owner.last_name AS owner_last_name
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
        LEFT JOIN itineraries i ON i.id = id_day.itinerary_id
        JOIN trips t ON t.id = COALESCE(ia.trip_id, i.trip_id)
        LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
        LEFT JOIN activity_suppliers asup ON asup.activity_id = ia.id AND asup.primary_supplier = true
        LEFT JOIN user_profiles owner ON owner.id = t.owner_id
        WHERE ${whereClause}
      )
      SELECT
        r.*,
        COALESCE(
          array_agg(DISTINCT (c.first_name || ' ' || c.last_name)) FILTER (WHERE c.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS passenger_names
      FROM receivables r
      LEFT JOIN trip_travelers tt ON tt.trip_id = r.trip_id
      LEFT JOIN contacts c ON c.id = tt.contact_id
      GROUP BY
        r.activity_pricing_id, r.confirmation_number, r.booking_reference,
        r.supplier_name, r.supplier_id, r.trip_name, r.trip_id,
        r.trip_start_date, r.activity_start_date, r.activity_name,
        r.expected_commission_cents, r.commission_status,
        r.reconciliation_date, r.reconciled_by,
        r.owner_first_name, r.owner_last_name
      ORDER BY r.trip_start_date DESC NULLS LAST, r.activity_name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // Count + sum query — uses SUM over subquery to avoid SUM(DISTINCT) bug
    const countQuery = sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(expected_commission_cents), 0)::bigint AS filtered_total_cents
      FROM (
        SELECT DISTINCT ON (ap.id)
          ap.commission_total_cents AS expected_commission_cents
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
        LEFT JOIN itineraries i ON i.id = id_day.itinerary_id
        JOIN trips t ON t.id = COALESCE(ia.trip_id, i.trip_id)
        LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
        LEFT JOIN activity_suppliers asup ON asup.activity_id = ia.id AND asup.primary_supplier = true
        WHERE ${whereClause}
      ) sub
    `

    const [dataRows, countRows]: [any[], any[]] = await Promise.all([
      this.db.client.execute(dataQuery),
      this.db.client.execute(countQuery),
    ])

    const total = countRows[0]?.total ?? 0
    const filteredTotalCents = Number(countRows[0]?.filtered_total_cents ?? 0)

    const data: PendingReceivableDto[] = dataRows.map((row: any) => ({
      activityPricingId: row.activity_pricing_id,
      confirmationNumber: row.confirmation_number ?? null,
      bookingReference: row.booking_reference ?? null,
      supplierName: row.supplier_name ?? null,
      supplierId: row.supplier_id ?? null,
      tripName: row.trip_name,
      tripId: row.trip_id,
      tripStartDate: row.trip_start_date ?? null,
      activityStartDate: row.activity_start_date ?? null,
      activityName: row.activity_name,
      passengerNames: row.passenger_names ?? [],
      expectedCommissionCents: Number(row.expected_commission_cents),
      commissionStatus: row.commission_status ?? null,
      reconciliationDate: row.reconciliation_date
        ? new Date(row.reconciliation_date).toISOString()
        : null,
      reconciledBy: row.reconciled_by ?? null,
      agentName: row.owner_first_name
        ? `${row.owner_first_name} ${row.owner_last_name ?? ''}`.trim()
        : null,
    }))

    return {
      data,
      filteredTotalCents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // ============================================================================
  // DEPOSIT MANAGEMENT (Supplier Commission Deposit Flow)
  // ============================================================================

  async createDeposit(
    agencyId: string,
    dto: CreateDepositDto,
    userId?: string
  ): Promise<DepositDetailResponseDto> {
    // Validate supplier belongs to this agency. Reporting depends on the
    // FK; a stale or cross-agency UUID would silently break commission
    // rollups, so we reject it loudly here.
    if (dto.supplierId) {
      await this.assertSupplierBelongsToAgency(agencyId, dto.supplierId)
    }

    const [check] = await this.db.client
      .insert(this.db.schema.commissionChecks)
      .values({
        agencyId,
        checkNumber: dto.depositNumber,
        checkType: 'received',
        checkDate: dto.depositDate,
        checkAmountCents: dto.totalAmountCents,
        currency: dto.currency ?? 'CAD',
        senderSupplierId: dto.supplierId ?? null,
        senderName: dto.senderName?.trim() || (dto.supplierId ? null : 'Supplier Deposit'),
        status: 'submitted',
        source: 'deposit',
        notes: dto.notes,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    return this.formatDepositDetail(check)
  }

  /**
   * Throws NotFoundException if the supplier id doesn't exist. Suppliers
   * are a shared catalog (no agency_id column on the suppliers table), so
   * the check is existence-only. Used by createDeposit / updateCheck to
   * keep commission_checks.sender_supplier_id honest for reporting.
   *
   * (The unused agencyId parameter is kept for API symmetry — if suppliers
   * ever become agency-scoped, this is the choke point to update.)
   */
  private async assertSupplierBelongsToAgency(
    _agencyId: string,
    supplierId: string,
  ): Promise<void> {
    const [row] = await this.db.client
      .select({ id: this.db.schema.suppliers.id })
      .from(this.db.schema.suppliers)
      .where(eq(this.db.schema.suppliers.id, supplierId))
      .limit(1)
    if (!row) {
      throw new NotFoundException(`Supplier ${supplierId} not found`)
    }
  }

  async finalizeDeposit(
    agencyId: string,
    depositId: string,
    dto: FinalizeDepositDto,
    actorId?: string
  ): Promise<DepositDetailResponseDto> {
    const check = await this.getCheckRecord(agencyId, depositId)

    if (check.source !== 'deposit') {
      throw new BadRequestException('Only deposit-type checks can be finalized via this endpoint')
    }

    if (check.status !== 'submitted') {
      throw new BadRequestException(
        `Deposit must be in 'submitted' status to finalize (current: '${check.status}')`
      )
    }

    // Validate matched + unreconciled = deposit total (prevent silent residual deltas)
    const matchedTotal = dto.items.reduce((sum, i) => sum + i.receivedCents, 0)
    const unreconciledTotal = (dto.unreconciled ?? []).reduce((sum, u) => sum + u.amountCents, 0)
    const reconciledTotal = matchedTotal + unreconciledTotal
    if (reconciledTotal !== check.checkAmountCents) {
      throw new BadRequestException(
        `Reconciled total (${reconciledTotal}) does not match deposit amount (${check.checkAmountCents}). ` +
        `Add unreconciled items for any residual difference.`
      )
    }

    const result = await this.db.client.transaction(async (tx) => {
      // Insert reconciled items
      for (const item of dto.items) {
        // Verify activity pricing belongs to same agency (prevent cross-tenant writes)
        const [pricing] = await tx
          .select({ id: this.db.schema.activityPricing.id })
          .from(this.db.schema.activityPricing)
          .where(
            and(
              eq(this.db.schema.activityPricing.id, item.activityPricingId),
              eq(this.db.schema.activityPricing.agencyId, agencyId)
            )
          )
          .limit(1)

        if (!pricing) {
          throw new BadRequestException(
            `Activity pricing ${item.activityPricingId} not found or does not belong to this agency`
          )
        }

        // PR-2 commit 6: derive embedded_tax_* from the supplier defaults
        // (added to suppliers in PR-1 commit 1). Falls back to (0, NULL, NULL)
        // when the supplier has no defaults configured — matches the
        // existing tf-demo backfill behavior. Caller-supplied embedded_tax_*
        // fields on the DTO take precedence when present.
        const resolvedTax = await this.resolveCheckItemTax(
          item.activityPricingId,
          item.receivedCents,
          {
            embeddedTaxCents: item.embeddedTaxCents,
            embeddedTaxType: item.embeddedTaxType,
            embeddedTaxRatePercent: item.embeddedTaxRatePercent,
          },
        )

        // Insert commission_check_item with the derived tax fields so
        // downstream IC v2 eligibility (which reads embedded_tax_* in
        // commission-formula) sees a complete record.
        await tx
          .insert(this.db.schema.commissionCheckItems)
          .values({
            checkId: depositId,
            activityPricingId: item.activityPricingId,
            receivedCents: item.receivedCents,
            receivedParentCents: 0,
            embeddedTaxCents: resolvedTax.embeddedTaxCents,
            embeddedTaxType: resolvedTax.embeddedTaxType,
            embeddedTaxRatePercent:
              resolvedTax.embeddedTaxRatePercent != null
                ? String(resolvedTax.embeddedTaxRatePercent)
                : null,
          })

        // Upsert commission_tracking: SELECT + INSERT/UPDATE
        // (no unique constraint on component_pricing_id, so ON CONFLICT not available)
        const commissionAmount = (item.receivedCents / 100).toFixed(2)
        const [existing] = await tx
          .select({ id: this.db.schema.commissionTracking.id })
          .from(this.db.schema.commissionTracking)
          .where(eq(this.db.schema.commissionTracking.activityPricingId, item.activityPricingId))
          .limit(1)

        if (existing) {
          await tx
            .update(this.db.schema.commissionTracking)
            .set({
              commissionStatus: 'received',
              commissionAmount,
              receivedCents: item.receivedCents,
              taxAmountCents: item.taxCents ?? 0,
              reconciliationDate: new Date(),
              reconciledBy: actorId,
              updatedAt: new Date(),
            })
            .where(eq(this.db.schema.commissionTracking.id, existing.id))
        } else {
          await tx
            .insert(this.db.schema.commissionTracking)
            .values({
              activityPricingId: item.activityPricingId,
              commissionAmount,
              commissionStatus: 'received',
              receivedCents: item.receivedCents,
              taxAmountCents: item.taxCents ?? 0,
              reconciliationDate: new Date(),
              reconciledBy: actorId,
            })
        }
      }

      // Insert unreconciled items (no matching booking)
      if (dto.unreconciled?.length) {
        for (const unrec of dto.unreconciled) {
          await tx
            .insert(this.db.schema.commissionCheckItems)
            .values({
              checkId: depositId,
              activityPricingId: null,
              description: unrec.description,
              receivedCents: unrec.amountCents,
              receivedParentCents: 0,
            })
        }
      }

      // Accept the deposit and mark reconciliation
      const [updated] = await tx
        .update(this.db.schema.commissionChecks)
        .set({
          status: 'accepted',
          reconciliationDate: new Date(),
          reconciledBy: actorId,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.commissionChecks.id, depositId))
        .returning()

      return updated
    })

    return this.formatDepositDetail(result)
  }

  async getDepositDetail(
    agencyId: string,
    depositId: string
  ): Promise<DepositDetailResponseDto> {
    const check = await this.getCheckRecord(agencyId, depositId)

    if (check.source !== 'deposit') {
      throw new BadRequestException('This endpoint is for deposit-type checks only')
    }

    // Fetch items with activity details via raw SQL for richer info
    const items: any[] = await this.db.client.execute(sql`
      SELECT
        cci.id,
        cci.check_id,
        cci.activity_pricing_id,
        cci.description,
        cci.projected_cents,
        cci.received_parent_cents,
        cci.received_cents,
        cci.created_at,
        cci.updated_at,
        ia.name AS activity_name,
        ia.confirmation_number,
        ap.booking_reference,
        t.name AS trip_name
      FROM commission_check_items cci
      LEFT JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      LEFT JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = id_day.itinerary_id
      LEFT JOIN trips t ON t.id = COALESCE(ia.trip_id, i.trip_id)
      WHERE cci.check_id = ${depositId}
      ORDER BY cci.created_at ASC
    `)

    const formattedItems = items.map((i: any) => ({
      id: i.id,
      checkId: i.check_id,
      activityPricingId: i.activity_pricing_id,
      description: i.description ?? null,
      projectedCents: i.projected_cents,
      receivedParentCents: i.received_parent_cents ?? 0,
      receivedCents: i.received_cents ?? 0,
      activityName: i.activity_name ?? null,
      confirmationNumber: i.confirmation_number ?? null,
      bookingReference: i.booking_reference ?? null,
      tripName: i.trip_name ?? null,
      createdAt: new Date(i.created_at).toISOString(),
      updatedAt: new Date(i.updated_at).toISOString(),
    }))

    const totalItemsCents = items.reduce((sum: number, i: any) => sum + (i.received_cents ?? 0), 0)

    // Fetch adjustments for summary
    const adjustments = await this.db.client
      .select()
      .from(this.db.schema.commissionAdjustments)
      .where(eq(this.db.schema.commissionAdjustments.checkId, depositId))
      .orderBy(desc(this.db.schema.commissionAdjustments.createdAt))

    const totalAdjustmentsCents = adjustments.reduce((sum, a) => sum + a.amountCents, 0)
    const reconciledTotal = totalItemsCents + totalAdjustmentsCents

    const summary: CommissionCheckSummaryDto = {
      totalItemsCents,
      totalAdjustmentsCents,
      reconciledTotal,
      unreconciledCents: check.checkAmountCents - reconciledTotal,
    }

    return {
      ...this.formatDepositDetail(check),
      items: formattedItems,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        checkId: a.checkId,
        agencyId: a.agencyId,
        description: a.description,
        amountCents: a.amountCents,
        adjustmentType: a.adjustmentType,
        taxType: a.taxType,
        taxRate: a.taxRate,
        agentUserId: a.agentUserId,
        companyName: a.companyName,
        status: a.status,
        source: a.source,
        sourceRef: a.sourceRef,
        createdBy: a.createdBy,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      summary,
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getCheckRecord(agencyId: string, checkId: string) {
    const [check] = await this.db.client
      .select()
      .from(this.db.schema.commissionChecks)
      .where(
        and(
          eq(this.db.schema.commissionChecks.id, checkId),
          eq(this.db.schema.commissionChecks.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!check) {
      throw new NotFoundException(`Commission check ${checkId} not found`)
    }

    return check
  }

  private validateTransition(currentStatus: CommissionCheckStatus, targetStatus: CommissionCheckStatus) {
    const allowed = VALID_CHECK_TRANSITIONS[currentStatus]
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none'}`
      )
    }
  }

  private formatCheck(check: any): CommissionCheckResponseDto {
    return {
      id: check.id,
      agencyId: check.agencyId,
      checkNumber: check.checkNumber,
      checkType: check.checkType,
      checkDate: check.checkDate,
      checkAmountCents: check.checkAmountCents,
      currency: check.currency,
      senderName: check.senderName,
      senderSupplierId: check.senderSupplierId,
      recipientName: check.recipientName,
      recipientUserId: check.recipientUserId,
      status: check.status,
      groupCheck: check.groupCheck,
      parentCheckId: check.parentCheckId,
      payrollId: check.payrollId,
      notes: check.notes,
      source: check.source,
      sourceRef: check.sourceRef,
      createdBy: check.createdBy,
      updatedBy: check.updatedBy,
      createdAt: check.createdAt.toISOString(),
      updatedAt: check.updatedAt.toISOString(),
    }
  }

  private formatCheckItem(item: any): CommissionCheckItemResponseDto {
    return {
      id: item.id,
      checkId: item.checkId,
      activityPricingId: item.activityPricingId ?? null,
      description: item.description ?? null,
      projectedCents: item.projectedCents,
      receivedParentCents: item.receivedParentCents ?? 0,
      receivedCents: item.receivedCents ?? 0,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private formatCommissionTracking(tracking: any): ActivityCommissionResponseDto {
    return {
      id: tracking.id,
      activityPricingId: tracking.activityPricingId,
      commissionRate: tracking.commissionRate,
      commissionAmount: tracking.commissionAmount,
      commissionStatus: tracking.commissionStatus,
      grossCommissionCents: tracking.grossCommissionCents,
      taxAmountCents: tracking.taxAmountCents ?? 0,
      taxType: tracking.taxType,
      netCommissionCents: tracking.netCommissionCents,
      receivedCents: tracking.receivedCents ?? 0,
      paidCents: tracking.paidCents ?? 0,
      adjustmentCents: tracking.adjustmentCents ?? 0,
      receivedParentCents: tracking.receivedParentCents ?? 0,
      platformFeeCents: tracking.platformFeeCents ?? 0,
      source: tracking.source,
      sourceBookingRef: tracking.sourceBookingRef,
      createdAt: tracking.createdAt.toISOString(),
      updatedAt: tracking.updatedAt.toISOString(),
    }
  }

  private formatDepositDetail(check: any): DepositDetailResponseDto {
    return {
      ...this.formatCheck(check),
      reconciliationDate: check.reconciliationDate
        ? check.reconciliationDate.toISOString()
        : null,
      reconciledBy: check.reconciledBy ?? null,
      accountingTransactionId: check.accountingTransactionId ?? null,
      fileUrl: check.fileUrl ?? null,
      fileName: check.fileName ?? null,
    }
  }
}
