'use client'

import { useState, useMemo } from 'react'
import { useEligibleForClaim, useSubmitClaim } from '@/hooks/use-ic-claims'
import { useMyTaxProfile } from '@/hooks/use-ic-payouts'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DollarSign, ChevronDown, ChevronRight, Info } from 'lucide-react'
import Link from 'next/link'
import type { EligibleItemDto } from '@/hooks/use-ic-claims'

// Preview only — server (PlaceOfSupplyService) is authoritative at submission time
const AGENCY_TAX_RATE_BP = 1300 // ON HST 13%
const AGENCY_TAX_TYPE = 'HST'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

interface Props {
  /** Optional custom trigger element; defaults to a "Claim Commission" Button */
  trigger?: React.ReactNode
  /**
   * Admin-only: when set, the dialog operates in "generate claim on behalf
   * of agent" mode. Eligible items, tax profile, and submission all hit the
   * admin endpoints scoped to this userId. The resulting invoice still
   * belongs to the IC; the admin is recorded as the actor in the audit log.
   */
  onBehalfOfUserId?: string
  /** Display name of the agent in admin mode (shown in the dialog title). */
  onBehalfOfName?: string
}

export function ClaimBuilder({ trigger, onBehalfOfUserId, onBehalfOfName }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // PR-2: positive adjustments are opt-in. Tracks which adjustmentIds the
  // IC has elected to take on this claim. Negative adjustments are
  // auto-included server-side regardless of this set.
  const [optedAdjustmentIds, setOptedAdjustmentIds] = useState<Set<string>>(new Set())
  // PR-2: per-item breakdown disclosure. Collapsed by default to keep
  // the list scannable; expanded shows the gross→tax→base→fee→split→share.
  const [expandedBreakdownIds, setExpandedBreakdownIds] = useState<Set<string>>(new Set())

  const isAdminMode = !!onBehalfOfUserId

  const { data: eligible, isLoading } = useEligibleForClaim(onBehalfOfUserId)
  const { data: profile } = useMyTaxProfile(onBehalfOfUserId)
  const submit = useSubmitClaim(onBehalfOfUserId)
  const { toast } = useToast()

  const taxApplies = profile?.gstHstRegistered === true

  // Per-currency running totals derived from current selection
  const previews = useMemo(() => {
    if (!eligible) return []
    return eligible.itemsByCurrency.map((group) => {
      const selectedItems = group.items.filter((i) => selectedIds.has(i.checkItemId))
      // PR-2: agentShareCents (formula output) drives the running total.
      const itemsTotal = selectedItems.reduce((s, i) => s + i.agentShareCents, 0)
      // PR-2: positive adjustments only count when opted in; negatives
      // always do (mirrors server-side filter in
      // fetchPendingAdjustmentsByCurrency).
      const includedAdjustments = group.adjustments.filter((a) =>
        a.isOptIn ? optedAdjustmentIds.has(a.adjustmentId) : true,
      )
      const adjustmentsTotal = includedAdjustments.reduce((s, a) => s + a.amountCents, 0)
      const base = itemsTotal + adjustmentsTotal
      const tax = taxApplies ? Math.round((base * AGENCY_TAX_RATE_BP) / 10_000) : 0
      const total = base + tax
      // PR-2 agency-retains preview: SUM(agencyRetainsCents) across selected
      // items, derived directly from each item's breakdown snapshot. Lets
      // the admin (and IC) see what's left over after the agent share +
      // fee + tax pass-through.
      const agencyRetains = selectedItems.reduce(
        (s, i) => s + (i.breakdown?.agencyRetainsCents ?? 0),
        0,
      )
      return {
        currency: group.currency,
        selectedItemCount: selectedItems.length,
        availableItemCount: group.items.length,
        adjustmentCount: group.adjustments.length,
        optInCount: group.adjustments.filter((a) => a.isOptIn).length,
        autoIncludeCount: group.adjustments.filter((a) => !a.isOptIn).length,
        itemsTotal,
        adjustmentsTotal,
        base,
        tax,
        total,
        agencyRetains,
        hasSelection: selectedItems.length > 0,
      }
    })
  }, [eligible, selectedIds, optedAdjustmentIds, taxApplies])

  const totalSelectedAcrossCurrencies = previews.reduce((s, p) => s + p.selectedItemCount, 0)
  const invoicesToBeCreated = previews.filter((p) => p.hasSelection).length

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllInCurrency = (_currency: string, ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleAdjustmentOptIn = (id: string) => {
    setOptedAdjustmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBreakdown = (id: string) => {
    setExpandedBreakdownIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (totalSelectedAcrossCurrencies === 0) return
    try {
      const result = await submit.mutateAsync({
        selectedCheckItemIds: Array.from(selectedIds),
        optedInAdjustmentIds: Array.from(optedAdjustmentIds),
      })
      toast({
        title: isAdminMode ? 'Claim generated' : 'Claim submitted',
        description: isAdminMode
          ? `${result.invoices?.length ?? 0} invoice(s) submitted on behalf of ${onBehalfOfName ?? 'the agent'} and queued for admin approval.`
          : `${result.invoices?.length ?? 0} invoice(s) created and sent for review.`,
      })
      setOpen(false)
      setSelectedIds(new Set())
      setOptedAdjustmentIds(new Set())
      setExpandedBreakdownIds(new Set())
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'An unexpected error occurred.'
      toast({ title: 'Submit failed', description: msg, variant: 'destructive' })
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Reset selection when closing so re-open is always fresh
    if (!next) {
      setSelectedIds(new Set())
      setOptedAdjustmentIds(new Set())
      setExpandedBreakdownIds(new Set())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <DollarSign className="mr-2 h-4 w-4" />
            {isAdminMode ? 'Generate claim' : 'Claim Commission'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAdminMode
              ? `Generate claim on behalf of ${onBehalfOfName ?? 'agent'}`
              : 'Claim eligible commissions'}
          </DialogTitle>
        </DialogHeader>

        {isAdminMode && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-3">
            You are submitting this claim on behalf of <strong>{onBehalfOfName ?? 'this IC'}</strong>.
            The resulting invoice will belong to them. An admin (not you) must still approve it from the Agent Claims tab.
          </p>
        )}

        {/* Payout profile required banner */}
        {!isLoading && !profile && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            {isAdminMode ? (
              <>This agent has not completed their payout profile yet. They must finish IC onboarding before a claim can be submitted on their behalf.</>
            ) : (
              <>
                You need to complete your{' '}
                <Link href="/portal/payouts/onboarding" className="underline font-medium">
                  payout profile
                </Link>{' '}
                before submitting a claim.
              </>
            )}
          </p>
        )}

        {/* Tax registration status */}
        {profile && !taxApplies && (
          <p className="text-xs text-muted-foreground">
            {isAdminMode ? 'This IC is' : 'You are'} not GST/HST registered — no tax will be applied to the invoice.
          </p>
        )}
        {profile && taxApplies && (
          <p className="text-xs text-muted-foreground">
            {AGENCY_TAX_TYPE} ({(AGENCY_TAX_RATE_BP / 100).toFixed(0)}%) will be added to the invoice. The server is authoritative at submission time.
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Loading eligible commissions…</p>}

        {!isLoading && eligible && eligible.itemsByCurrency.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No eligible commissions to claim at this time.
          </p>
        )}

        {eligible &&
          eligible.itemsByCurrency.map((group) => {
            const preview = previews.find((p) => p.currency === group.currency)!
            const allIds = group.items.map((i) => i.checkItemId)
            const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))

            return (
              <section key={group.currency} className="border rounded-lg p-4 space-y-3">
                {/* Currency group header */}
                <header className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    {group.currency}
                    <Badge variant="outline">{group.items.length} eligible item{group.items.length !== 1 ? 's' : ''}</Badge>
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectAllInCurrency(group.currency, allIds)}
                    disabled={group.items.length === 0}
                    aria-label={allSelected ? `Deselect all ${group.currency} items` : `Select all ${group.currency} items`}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </Button>
                </header>

                {/* Line items — PR-2: each row exposes a chevron to expand
                    the formula breakdown (gross → tax → base → fee →
                    distributable → split → agent share) sourced from the
                    breakdown JSONB returned by /ic-payouts/me/eligible. */}
                <ul className="space-y-0" role="list" aria-label={`${group.currency} commission items`}>
                  {group.items.map((item) => {
                    const checked = selectedIds.has(item.checkItemId)
                    const expanded = expandedBreakdownIds.has(item.checkItemId)
                    const labelId = `label-${item.checkItemId}`
                    return (
                      <li key={item.checkItemId} className="border-b last:border-b-0">
                        <div className="flex items-start gap-3 py-2.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(item.checkItemId)}
                            id={`item-${item.checkItemId}`}
                            aria-labelledby={labelId}
                            className="mt-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => toggleBreakdown(item.checkItemId)}
                            className="text-muted-foreground hover:text-foreground mt-0.5"
                            aria-label={expanded ? 'Hide breakdown' : 'Show breakdown'}
                            aria-expanded={expanded}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <label
                            id={labelId}
                            htmlFor={`item-${item.checkItemId}`}
                            className="flex-1 flex justify-between cursor-pointer min-w-0"
                          >
                            <div className="min-w-0 pr-4">
                              <div className="text-sm font-medium truncate">{item.tripRef ?? '(No trip ref)'}</div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                              )}
                            </div>
                            <span className="font-mono text-sm tabular-nums shrink-0">
                              {formatCents(item.agentShareCents, group.currency)}
                            </span>
                          </label>
                        </div>
                        {expanded && <BreakdownRows item={item} currency={group.currency} />}
                      </li>
                    )
                  })}
                </ul>

                {/* PR-2: Pending adjustments — opt-in (positive) vs auto-include (negative).
                    The IC checks positives they want this claim; clawbacks are always-on with a tooltip. */}
                {group.adjustments.length > 0 && (
                  <div className="bg-muted/40 rounded-md p-3 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pending adjustments
                    </div>
                    {group.adjustments.map((a) => {
                      if (a.isOptIn) {
                        const opted = optedAdjustmentIds.has(a.adjustmentId)
                        return (
                          <label
                            key={a.adjustmentId}
                            htmlFor={`adj-${a.adjustmentId}`}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              id={`adj-${a.adjustmentId}`}
                              checked={opted}
                              onCheckedChange={() => toggleAdjustmentOptIn(a.adjustmentId)}
                            />
                            <span className="flex-1 text-muted-foreground">{a.description}</span>
                            <Badge variant="outline" className="text-[10px]">opt-in</Badge>
                            <span className="font-mono tabular-nums text-green-700">
                              +{formatCents(a.amountCents, group.currency)}
                            </span>
                          </label>
                        )
                      }
                      // Negative — auto-included
                      return (
                        <div key={a.adjustmentId} className="flex items-center gap-2 text-sm">
                          <Checkbox checked disabled aria-label="Auto-included" />
                          <span className="flex-1 text-muted-foreground">{a.description}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] cursor-help">
                                  <Info className="h-3 w-3 mr-0.5" />
                                  clawback
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Negative adjustments (e.g. supplier reversals) are automatically applied
                                to every claim in this currency. You cannot opt out.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="font-mono tabular-nums text-red-600">
                            {formatCents(a.amountCents, group.currency)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Per-currency invoice preview — only when there's a selection */}
                {preview.hasSelection && (
                  <div className="text-sm space-y-1 pt-2 border-t">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items selected ({preview.selectedItemCount}):</span>
                      <span className="font-mono tabular-nums">{formatCents(preview.itemsTotal, group.currency)}</span>
                    </div>
                    {preview.adjustmentCount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Adjustments included:</span>
                        <span className={`font-mono tabular-nums ${preview.adjustmentsTotal < 0 ? 'text-red-600' : ''}`}>
                          {formatCents(preview.adjustmentsTotal, group.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="font-mono tabular-nums">{formatCents(preview.base, group.currency)}</span>
                    </div>
                    {taxApplies && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>
                          {AGENCY_TAX_TYPE} ({(AGENCY_TAX_RATE_BP / 100).toFixed(0)}%) preview:
                        </span>
                        <span className="font-mono tabular-nums">{formatCents(preview.tax, group.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold pt-1 border-t">
                      <span>Invoice total (preview):</span>
                      <span className="font-mono tabular-nums">{formatCents(preview.total, group.currency)}</span>
                    </div>
                    {/* PR-2 agency retains: the cents that stay with the agency
                        after this claim — tech fee + tax pass-through + the
                        agency's share of distributable. Surfaced for full
                        transparency on both admin and agent surfaces. */}
                    <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-dashed mt-1">
                      <span>Agency retains (informational):</span>
                      <span className="font-mono tabular-nums">
                        {formatCents(preview.agencyRetains, group.currency)}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            )
          })}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={totalSelectedAcrossCurrencies === 0 || !profile || submit.isPending}
            aria-disabled={totalSelectedAcrossCurrencies === 0 || !profile || submit.isPending}
          >
            {submit.isPending
              ? 'Submitting…'
              : invoicesToBeCreated > 1
                ? `Submit (${invoicesToBeCreated} invoices)`
                : `Submit claim (${totalSelectedAcrossCurrencies} item${totalSelectedAcrossCurrencies === 1 ? '' : 's'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * PR-2 ClaimBuilder transparency: shows the full formula derivation for a
 * single eligible item. Sourced from the breakdown JSONB
 * (CommissionBreakdownDto) returned alongside agentShareCents by
 * /ic-payouts/me/eligible after PR-1 commit 7.
 *
 * Rows mirror commission-formula.ts exactly:
 *   gross → embedded tax → base → fee → distributable → split → share
 * with the override flags surfaced inline when active so a curious agent
 * can see WHY their tech fee or split is different than usual.
 */
function BreakdownRows({ item, currency }: { item: EligibleItemDto; currency: string }) {
  const b = item.breakdown
  if (!b) {
    return (
      <div className="ml-7 mb-2 text-xs text-muted-foreground italic">
        Breakdown unavailable (legacy item)
      </div>
    )
  }
  return (
    <dl className="ml-7 mb-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
      <dt className="text-muted-foreground">Gross received from supplier</dt>
      <dd className="font-mono tabular-nums">{formatCents(b.grossReceivedCents, currency)}</dd>

      {b.embeddedTaxCents !== 0 && (
        <>
          <dt className="text-muted-foreground">
            − Embedded tax
            {b.embeddedTaxType && (
              <span className="text-[10px] ml-1">
                ({b.embeddedTaxType}{' '}
                {b.embeddedTaxRatePercent != null ? `${b.embeddedTaxRatePercent}%` : ''})
              </span>
            )}
          </dt>
          <dd className="font-mono tabular-nums text-muted-foreground">
            −{formatCents(b.embeddedTaxCents, currency)}
          </dd>
        </>
      )}

      <dt className="font-medium pt-1 border-t border-dashed">Commissionable base</dt>
      <dd className="font-mono tabular-nums pt-1 border-t border-dashed">
        {formatCents(b.commissionableBaseCents, currency)}
      </dd>

      <dt className="text-muted-foreground">
        − Tech fee ({b.feeRatePercent}%)
        {b.feeRateOverridden && (
          <Badge variant="outline" className="text-[9px] ml-1 px-1 py-0">trip override</Badge>
        )}
      </dt>
      <dd className="font-mono tabular-nums text-muted-foreground">
        −{formatCents(b.platformFeeCents, currency)}
      </dd>

      <dt className="font-medium">Distributable</dt>
      <dd className="font-mono tabular-nums">{formatCents(b.distributableCents, currency)}</dd>

      <dt className="text-muted-foreground">
        × Agent split ({b.agentSplitPercent}%)
        {b.agentSplitOverridden && (
          <Badge variant="outline" className="text-[9px] ml-1 px-1 py-0">trip override</Badge>
        )}
      </dt>
      <dd className="font-mono tabular-nums text-muted-foreground">
        {formatCents(b.agentPoolCents, currency)}
      </dd>

      {b.collaboratorPercent !== 100 && (
        <>
          <dt className="text-muted-foreground">× Your share ({b.collaboratorPercent}%)</dt>
          <dd className="font-mono tabular-nums text-muted-foreground">
            {formatCents(b.agentShareCents, currency)}
          </dd>
        </>
      )}

      <dt className="font-semibold pt-1 border-t">Your share</dt>
      <dd className="font-mono tabular-nums font-semibold pt-1 border-t">
        {formatCents(b.agentShareCents, currency)}
      </dd>

      <dt className="text-[10px] text-muted-foreground italic pt-0.5">Agency retains for this item</dt>
      <dd className="font-mono tabular-nums text-[10px] text-muted-foreground italic pt-0.5">
        {formatCents(b.agencyRetainsCents, currency)}
      </dd>
    </dl>
  )
}
