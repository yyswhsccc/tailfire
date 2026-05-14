'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMyTaxProfile, useMyAuthorization, useMyPayoutAccounts } from '@/hooks/use-ic-payouts'

/**
 * /portal/payouts — overview redirector.
 *
 * Checks each onboarding step in sequence and redirects to the first
 * incomplete step. Once fully onboarded, renders the payouts dashboard
 * placeholder (real dashboard arrives with Tasks 15+).
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

    // All onboarding steps complete — stay on this page (dashboard)
  }, [profile, auth, accounts, isLoading, router])

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  // Fully onboarded — show placeholder dashboard until Task 15+ builds it out
  const isFullyOnboarded =
    !!profile &&
    !!auth &&
    auth.status === 'active' &&
    !!accounts &&
    accounts.length > 0

  if (!isFullyOnboarded) {
    // Still redirecting — render nothing to avoid flash
    return null
  }

  return (
    <div className="container max-w-4xl py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Commission payouts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your payout accounts and transaction history.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Payout dashboard coming in Task 15. Your setup is complete.
      </div>
    </div>
  )
}
