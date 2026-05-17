'use client'

/**
 * CancelBookingDialog — #452
 *
 * Cancellation of a booked activity must record reason + refund decision +
 * actor. The DB-level `chk_cancellation_requires_metadata` enforces the
 * same shape so this dialog is the only safe UI path once payments exist.
 *
 * Use cases:
 * 1. Dropdown menu "Cancel Booking..." — open with the booked activity.
 * 2. Caught 409 BOOKING_HAS_PAYMENTS_USE_CANCEL — open after unmark fails.
 */

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useCancelActivityBooking } from '@/hooks/use-activity-bookings'
import type { CancellationRefundDecision } from '@tailfire/shared-types'

interface CancelBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityId: string
  activityName: string
  cancellationPolicy?: string | null
  paymentTotalCents?: number
  confirmationNumber?: string | null
  onCancelled?: () => void
}

const REFUND_OPTIONS: Array<{ value: CancellationRefundDecision; label: string; hint: string }> = [
  {
    value: 'full_refund_pending',
    label: 'Full refund pending',
    hint: 'Supplier will refund the full booking amount.',
  },
  {
    value: 'partial_refund_pending',
    label: 'Partial refund pending',
    hint: 'A portion is refundable; specify the amount below.',
  },
  {
    value: 'no_refund',
    label: 'No refund',
    hint: 'Cancellation falls inside the no-refund window.',
  },
  {
    value: 'supplier_retains',
    label: 'Supplier retains (rebook credit, etc.)',
    hint: 'Funds stay with supplier — future credit or rebooking.',
  },
]

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  activityId,
  activityName,
  cancellationPolicy,
  paymentTotalCents = 0,
  confirmationNumber,
  onCancelled,
}: CancelBookingDialogProps) {
  const { toast } = useToast()
  const cancelBooking = useCancelActivityBooking()

  const [reason, setReason] = useState('')
  const [refundDecision, setRefundDecision] = useState<CancellationRefundDecision | null>(null)
  const [refundAmount, setRefundAmount] = useState<string>('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
      setRefundDecision(null)
      setRefundAmount('')
      setNotes('')
    }
  }, [open])

  const requiresAmount = refundDecision === 'partial_refund_pending'

  const canSubmit =
    reason.trim().length > 0 &&
    refundDecision !== null &&
    (!requiresAmount || (parseFloat(refundAmount) > 0))

  async function handleConfirm() {
    if (!canSubmit || refundDecision === null) return
    try {
      await cancelBooking.mutateAsync({
        activityId,
        data: {
          cancellationReason: reason.trim(),
          refundDecision,
          refundAmountCents: requiresAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined,
          cancellationNotes: notes.trim() || undefined,
        },
      })
      toast({
        title: 'Booking cancelled',
        description: `"${activityName}" has been cancelled. Refund: ${REFUND_OPTIONS.find(r => r.value === refundDecision)?.label}.`,
      })
      onCancelled?.()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Cancellation failed',
        description: (err as Error).message,
        variant: 'destructive',
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel booking — {activityName}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {paymentTotalCents > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <div className="font-medium text-amber-900">
                    {formatCents(paymentTotalCents)} in payments recorded
                  </div>
                  <div className="text-xs text-amber-800">
                    Payments stay on the books — refunds are tracked separately so the
                    financial ledger remains intact.
                  </div>
                </div>
              )}
              {confirmationNumber && (
                <div className="text-xs text-gray-600">
                  Supplier confirmation: <span className="font-mono">{confirmationNumber}</span> —
                  remember to notify the supplier of the cancellation if you haven't already.
                </div>
              )}
              {cancellationPolicy && (
                <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
                  <div className="font-medium text-gray-900 mb-1">Cancellation policy</div>
                  <div className="whitespace-pre-wrap">{cancellationPolicy}</div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="cancel-reason">Cancellation reason *</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Client requested change of date; supplier accepted within 24h policy."
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="cancel-refund">Refund decision *</Label>
            <Select value={refundDecision ?? ''} onValueChange={(v) => setRefundDecision(v as CancellationRefundDecision)}>
              <SelectTrigger id="cancel-refund" className="mt-1">
                <SelectValue placeholder="How should payments be treated?" />
              </SelectTrigger>
              <SelectContent>
                {REFUND_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.hint}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {requiresAmount && (
            <div>
              <Label htmlFor="cancel-refund-amount">Refund amount (CAD) *</Label>
              <Input
                id="cancel-refund-amount"
                type="number"
                step="0.01"
                min="0"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="500.00"
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="cancel-notes">Internal notes (optional)</Label>
            <Textarea
              id="cancel-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Supplier ref CXL-2026-117; refund expected in 5-7 business days."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelBooking.isPending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                void handleConfirm()
              }}
              disabled={!canSubmit || cancelBooking.isPending}
            >
              {cancelBooking.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel booking
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
