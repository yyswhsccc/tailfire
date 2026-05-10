'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface Props {
  trigger: React.ReactNode
  onConfirm: (reason: string) => Promise<void>
  invoiceNumber: string
}

export function RejectDialog({ trigger, onConfirm, invoiceNumber }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handle = async () => {
    if (!reason.trim()) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
      setOpen(false)
      setReason('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            The IC will be notified. The commission items in this invoice will return to eligible status.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason for rejection (visible to the IC)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handle} disabled={!reason.trim() || submitting}>
            {submitting ? 'Rejecting…' : 'Reject invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
