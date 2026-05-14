'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useMarkFailed } from '@/hooks/use-ic-admin-disbursements'
import { useToast } from '@/hooks/use-toast'

interface Props {
  disbursementId: string
  open: boolean
  onClose: () => void
}

export function MarkFailedForm({ disbursementId, open, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const markFailed = useMarkFailed()

  const isValid = reason.trim().length >= 10

  const handleSubmit = async () => {
    if (!isValid) return
    setSubmitting(true)
    try {
      await markFailed.mutateAsync({ id: disbursementId, reason: reason.trim() })
      toast({
        title: 'Disbursement marked failed',
        description: 'The invoice has been cancelled and commission items returned to eligible status.',
      })
      setReason('')
      onClose()
    } catch (e) {
      toast({
        title: 'Mark failed error',
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
          <DialogTitle>Mark disbursement as failed</DialogTitle>
          <DialogDescription>
            This will cancel the invoice and return commission items to eligible status. The IC can resubmit a new claim.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fail-reason">Reason (required, min 10 characters)</Label>
          <Textarea
            id="fail-reason"
            placeholder="e.g. Bank returned transfer — invalid account number. IC must update their payout account."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            disabled={submitting}
          />
          {reason.length > 0 && reason.trim().length < 10 && (
            <p className="text-xs text-destructive">
              Reason must be at least 10 characters ({10 - reason.trim().length} more needed).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !isValid}
          >
            {submitting ? 'Submitting…' : 'Mark Failed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
