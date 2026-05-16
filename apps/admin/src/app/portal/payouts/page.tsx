'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import { useMyTaxProfile, useMyAuthorization, useMyPayoutAccounts } from '@/hooks/use-ic-payouts'
import { useEligibleForClaim, useMyInvoices } from '@/hooks/use-ic-claims'
import { ClaimBuilder } from '@/app/commission/_components/claim-builder'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * /portal/payouts — IC's commission claim dashboard (PR-2 commit 5).
 *
 * Redirects to onboarding when incomplete. Once onboarded, renders:
 *   1. Eligible commissions summary + inline <ClaimBuilder /> (the same
 *      shared component admins use in commission/Claims) — surfaces
 *      breakdown rows + opt-in adjustments + agency-retains.
 *   2. Recent invoices list (links to detail pages).
 *
 * This replaces the "dashboard coming in Task 15" placeholder.
 */
export default function PayoutsOverviewPage() {
  const router = useRouter()

  const { data: profile, isLoading: profileLoading } = useMyTaxProfile()
  const { data: auth, isLoading: authLoading } = useMyAuthorization()
  const { data: accounts, isLoading: accountsLoading } = useMyPayoutAccounts()

  const isLoading = profileLoading || authLoading || accountsLoading

  useEffect(() => {
    if (isLoading) return
    if (!profile) {
      router.replace('/portal/payouts/onboarding?step=1')
      return
    }
    if (!auth || auth.status !== 'active') {
      router.replace('/portal/payouts/onboarding?step=2')
      return
    }
    if (!accounts || accounts.length === 0) {
      router.replace('/portal/payouts/onboarding?step=3')
      return
    }
  }, [profile, auth, accounts, isLoading, router])

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  const isFullyOnboarded =
    !!profile &&
    !!auth &&
    auth.status === 'active' &&
    !!accounts &&
    accounts.length > 0

  if (!isFullyOnboarded) {
    return null
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Commission payouts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a claim for your eligible commissions and review past invoices.
        </p>
      </div>

      <EligibleClaimSection />
      <RecentInvoicesSection />
    </div>
  )
}

/**
 * Shows a summary of eligible commissions across all currencies and surfaces
 * the shared ClaimBuilder. The ClaimBuilder dialog gives the IC full
 * transparency on the formula (gross → tax → base → fee → split → share)
 * via the PR-2 breakdown rows, plus opt-in for positive adjustments.
 */
function EligibleClaimSection() {
  const { data: eligible, isLoading } = useEligibleForClaim()

  const totalsByCurrency = (eligible?.itemsByCurrency ?? []).map((group) => ({
    currency: group.currency,
    itemCount: group.items.length,
    itemsTotalCents: group.items.reduce((s, i) => s + i.agentShareCents, 0),
    optInAdjustmentCount: group.adjustments.filter((a) => a.isOptIn).length,
    autoIncludeAdjustmentCount: group.adjustments.filter((a) => !a.isOptIn).length,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to claim</CardTitle>
        <CardDescription>
          Activities where the trip has departed and the admin has reconciled the supplier
          deposit. Click <em>Claim Commission</em> to review the breakdown and submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading eligible items…</p>}
        {!isLoading && totalsByCurrency.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing eligible right now. Items appear here once a trip has departed and the
            admin has reconciled the supplier deposit.
          </p>
        )}
        {totalsByCurrency.length > 0 && (
          <ul className="space-y-2">
            {totalsByCurrency.map((t) => (
              <li
                key={t.currency}
                className="flex items-center justify-between rounded border border-ash-100 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {t.currency}: {t.itemCount} item{t.itemCount === 1 ? '' : 's'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.optInAdjustmentCount > 0 &&
                      `${t.optInAdjustmentCount} positive adjustment${t.optInAdjustmentCount === 1 ? '' : 's'} available · `}
                    {t.autoIncludeAdjustmentCount > 0 &&
                      `${t.autoIncludeAdjustmentCount} clawback${t.autoIncludeAdjustmentCount === 1 ? '' : 's'} auto-included`}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-sm">
                  {t.currency} {(t.itemsTotalCents / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-2">
          <ClaimBuilder />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Recent invoices list. Links to /portal/payouts/invoices/:id detail pages
 * (built in a future commit; for now just shows the row).
 */
function RecentInvoicesSection() {
  const { data: invoices, isLoading } = useMyInvoices()

  const rows = ((invoices as Array<{
    id: string
    invoiceNumber: string
    invoiceDate: string
    currency: string
    totalCents: number
    status: string
  }>) ?? []).slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent invoices</CardTitle>
        <CardDescription>Your last 10 commission claim invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading invoices…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No invoices yet. Submit your first claim above.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-ash-100">
            {rows.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/portal/payouts/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-ash-50 rounded px-2"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{inv.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {inv.invoiceDate} · {inv.currency}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px]">
                      {inv.status}
                    </Badge>
                    <span className="font-mono tabular-nums text-sm">
                      {inv.currency} {(inv.totalCents / 100).toFixed(2)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
