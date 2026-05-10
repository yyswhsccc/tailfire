'use client'

import { useRouter } from 'next/navigation'
import { AccountFormDialog } from '../../accounts/_components/account-form-dialog'

export function FirstAccountStep() {
  const router = useRouter()

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Add your first payout account</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you&apos;d like to receive commission payouts. You can add
          additional accounts later — one default per currency.
        </p>
      </div>

      <AccountFormDialog
        forceDefault
        onSuccess={() => router.push('/portal/payouts?onboarded=1')}
      />
    </div>
  )
}
