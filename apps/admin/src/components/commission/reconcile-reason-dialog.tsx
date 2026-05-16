/**
 * reconcile-reason-dialog.tsx (PR-2 Commit 3)
 *
 * Shared signed-transition dialog. PR-1 forces a reason on the
 * /unreconcile endpoint (audit pillar #5: "signed transitions"). Any UI
 * that flips a reconciled item back to pending — admin reconciliation page,
 * activity booking toggle, deposit per-line, etc. — opens this dialog so
 * the reason capture is one shape across surfaces.
 *
 * `requireReason` defaults to true (the unreconcile case). Pass false for
 * the optional reason on positive reconciles + bulk-reconciles.
 */

'use client'

import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ReconcileReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  requireReason?: boolean
  /** Placeholder text shown in the reason field. */
  placeholder?: string
  /** Disables the confirm button while the parent mutation is in flight. */
  isPending?: boolean
  /**
   * Called when the admin clicks Confirm. Receives the (possibly empty)
   * reason. The caller is responsible for closing the dialog on success
   * via onOpenChange(false).
   */
  onConfirm: (reason: string) => void | Promise<void>
}

export function ReconcileReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireReason = true,
  placeholder,
  isPending,
  onConfirm,
}: ReconcileReasonDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset state when the dialog opens.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setReason('')
      setError(null)
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError('Reason is required — recorded in the audit trail.')
      return
    }
    setError(null)
    await onConfirm(reason.trim())
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4">
          <Label htmlFor="reconcileReason" className="text-sm">
            Reason {requireReason ? <span className="text-red-600">*</span> : <span className="text-ash-400">(optional)</span>}
          </Label>
          <Input
            id="reconcileReason"
            placeholder={placeholder ?? 'e.g. supplier short — chasing missing $50'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Saving…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
