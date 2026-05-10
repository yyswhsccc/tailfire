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
import { DollarSign } from 'lucide-react'
import Link from 'next/link'

// Preview only — server (PlaceOfSupplyService) is authoritative at submission time
const AGENCY_TAX_RATE_BP = 1300 // ON HST 13%
const AGENCY_TAX_TYPE = 'HST'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

interface Props {
  /** Optional custom trigger element; defaults to a "Claim Commission" Button */
  trigger?: React.ReactNode
}

export function ClaimBuilder({ trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: eligible, isLoading } = useEligibleForClaim()
  const { data: profile } = useMyTaxProfile()
  const submit = useSubmitClaim()
  const { toast } = useToast()

  const taxApplies = profile?.gstHstRegistered === true

  // Per-currency running totals derived from current selection
  const previews = useMemo(() => {
    if (!eligible) return []
    return eligible.itemsByCurrency.map((group) => {
      const selectedItems = group.items.filter((i) => selectedIds.has(i.checkItemId))
      const itemsTotal = selectedItems.reduce((s, i) => s + i.commissionCents, 0)
      const adjustmentsTotal = group.adjustments.reduce((s, a) => s + a.amountCents, 0)
      const base = itemsTotal + adjustmentsTotal
      const tax = taxApplies ? Math.round((base * AGENCY_TAX_RATE_BP) / 10_000) : 0
      const total = base + tax
      return {
        currency: group.currency,
        selectedItemCount: selectedItems.length,
        availableItemCount: group.items.length,
        adjustmentCount: group.adjustments.length,
        itemsTotal,
        adjustmentsTotal,
        base,
        tax,
        total,
        hasSelection: selectedItems.length > 0,
      }
    })
  }, [eligible, selectedIds, taxApplies])

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

  const handleSubmit = async () => {
    if (totalSelectedAcrossCurrencies === 0) return
    try {
      const result = await submit.mutateAsync(Array.from(selectedIds))
      toast({
        title: 'Claim submitted',
        description: `${result.invoices?.length ?? 0} invoice(s) created and sent for review.`,
      })
      setOpen(false)
      setSelectedIds(new Set())
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'An unexpected error occurred.'
      toast({ title: 'Submit failed', description: msg, variant: 'destructive' })
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Reset selection when closing so re-open is always fresh
    if (!next) setSelectedIds(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <DollarSign className="mr-2 h-4 w-4" />
            Claim Commission
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Claim eligible commissions</DialogTitle>
        </DialogHeader>

        {/* Payout profile required banner */}
        {!isLoading && !profile && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            You need to complete your{' '}
            <Link href="/portal/payouts/onboarding" className="underline font-medium">
              payout profile
            </Link>{' '}
            before submitting a claim.
          </p>
        )}

        {/* Tax registration status */}
        {profile && !taxApplies && (
          <p className="text-xs text-muted-foreground">
            You are not GST/HST registered — no tax will be applied to your invoice.
          </p>
        )}
        {profile && taxApplies && (
          <p className="text-xs text-muted-foreground">
            {AGENCY_TAX_TYPE} ({(AGENCY_TAX_RATE_BP / 100).toFixed(0)}%) will be added to your invoice. The server is authoritative at submission time.
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

                {/* Line items */}
                <ul className="space-y-0" role="list" aria-label={`${group.currency} commission items`}>
                  {group.items.map((item) => {
                    const checked = selectedIds.has(item.checkItemId)
                    const labelId = `label-${item.checkItemId}`
                    return (
                      <li key={item.checkItemId} className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(item.checkItemId)}
                          id={`item-${item.checkItemId}`}
                          aria-labelledby={labelId}
                          className="mt-0.5"
                        />
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
                            {formatCents(item.commissionCents, group.currency)}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>

                {/* Pending adjustments (auto-included) */}
                {group.adjustments.length > 0 && (
                  <div className="bg-muted/40 rounded-md p-3 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pending adjustments (auto-included)
                    </div>
                    {group.adjustments.map((a) => (
                      <div key={a.adjustmentId} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{a.description}</span>
                        <span
                          className={`font-mono tabular-nums ${a.amountCents < 0 ? 'text-red-600' : 'text-green-700'}`}
                        >
                          {formatCents(a.amountCents, group.currency)}
                        </span>
                      </div>
                    ))}
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
                        <span>Adjustments:</span>
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
