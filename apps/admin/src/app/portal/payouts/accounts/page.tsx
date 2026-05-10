'use client'

import { useState } from 'react'
import { useMyPayoutAccounts } from '@/hooks/use-ic-payouts'
import { AccountFormDialog } from './_components/account-form-dialog'
import { AccountsTable } from './_components/accounts-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export default function AccountsPage() {
  const { data: accounts = [], isLoading } = useMyPayoutAccounts()
  const [openAdd, setOpenAdd] = useState(false)

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payout accounts</h1>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button>Add account</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add a payout account</DialogTitle>
            </DialogHeader>
            <AccountFormDialog onSuccess={() => setOpenAdd(false)} />
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading accounts…</div>
      ) : (
        <AccountsTable accounts={accounts} />
      )}
    </div>
  )
}
