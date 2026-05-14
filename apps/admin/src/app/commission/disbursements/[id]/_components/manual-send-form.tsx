'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMarkSent, useUploadProof } from '@/hooks/use-ic-admin-disbursements'
import { useToast } from '@/hooks/use-toast'

interface Props {
  disbursementId: string
  open: boolean
  onClose: () => void
}

export function ManualSendForm({ disbursementId, open, onClose }: Props) {
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const markSent = useMarkSent()
  const uploadProof = useUploadProof()

  const handleSubmit = async () => {
    if (!reference.trim()) {
      toast({ title: 'Reference required', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      let proofPath: string | undefined
      if (file) {
        const result = await uploadProof.mutateAsync({ id: disbursementId, file })
        proofPath = result.storagePath
      }
      await markSent.mutateAsync({ id: disbursementId, reference: reference.trim(), proofPath })
      toast({ title: 'Marked sent', description: 'IC payout has been marked as sent.' })
      setReference('')
      setFile(null)
      onClose()
    } catch (e) {
      toast({
        title: 'Mark sent failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (o: boolean) => {
    if (!o && !submitting) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark disbursement as sent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="reference">Reference (required)</Label>
            <Input
              id="reference"
              placeholder="e.g. e-Transfer ref, Wise tx id, wire confirmation #"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Visible to the IC on their payout history.
            </p>
          </div>
          <div>
            <Label htmlFor="proof">Proof of payment (optional)</Label>
            <Input
              id="proof"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/heic"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              PDF, PNG, JPEG, or HEIC. Stored privately; admins can view via signed URL.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reference.trim()}>
            {submitting ? 'Submitting…' : 'Mark Sent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
