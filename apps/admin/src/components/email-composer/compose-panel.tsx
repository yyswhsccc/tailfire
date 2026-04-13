'use client'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useEmailStore } from '@/stores/email.store'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { EmailComposer } from './email-composer'

export function ComposePanel() {
  const compose = useEmailStore((s) => s.compose)
  const closeCompose = useEmailStore((s) => s.closeCompose)
  const { data: accounts } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  if (!compose || !accountId) return null

  return (
    <Sheet open={!!compose} onOpenChange={(open) => !open && closeCompose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] p-0 flex flex-col">
        <SheetTitle className="sr-only">Compose Email</SheetTitle>
        <EmailComposer accountId={accountId} compose={compose} className="h-full" />
      </SheetContent>
    </Sheet>
  )
}
