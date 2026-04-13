'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useEmailStore } from '@/stores/email.store'
import { EmailComposer } from './email-composer'

interface ComposeDialogProps {
  accountId: string
}

export function ComposeDialog({ accountId }: ComposeDialogProps) {
  const compose = useEmailStore((s) => s.compose)
  const closeCompose = useEmailStore((s) => s.closeCompose)

  if (!compose || !accountId) return null

  return (
    <Dialog open={!!compose} onOpenChange={(open) => !open && closeCompose()}>
      <DialogContent className="max-w-3xl h-[80vh] p-0 flex flex-col gap-0">
        <DialogTitle className="sr-only">Compose Email</DialogTitle>
        <EmailComposer accountId={accountId} compose={compose} className="h-full" />
      </DialogContent>
    </Dialog>
  )
}
