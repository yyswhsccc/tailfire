'use client'

/**
 * CheckEditDialog — admin row-level edit for a commission check.
 *
 * Reuses the existing PATCH /commission/checks/:id endpoint. The server
 * enforces that accepted/cancelled checks can't be edited (BadRequest) so
 * we mostly hide the trigger for those rows; the dialog still shows a
 * helpful error if the server rejects.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateCheck, type UpdateCheckPayload } from '@/hooks/use-commission'
import { useToast } from '@/hooks/use-toast'
import type { CommissionCheckResponseDto } from '@tailfire/shared-types/api'

interface Props {
  check: CommissionCheckResponseDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function centsFromDollars(dollars: string): number | null {
  const n = Number.parseFloat(dollars)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

export function CheckEditDialog({ check, open, onOpenChange }: Props) {
  const update = useUpdateCheck()
  const { toast } = useToast()

  // Local form state — hydrated from the row each time the dialog opens.
  const [checkNumber, setCheckNumber] = useState('')
  const [checkDate, setCheckDate] = useState('')
  const [amountDollars, setAmountDollars] = useState('')
  const [currency, setCurrency] = useState('CAD')
  const [counterparty, setCounterparty] = useState('')
  const [status, setStatus] = useState<'pending' | 'submitted' | 'accepted' | 'cancelled'>('pending')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!check) return
    setCheckNumber(check.checkNumber)
    setCheckDate(check.checkDate.slice(0, 10))
    setAmountDollars(dollarsFromCents(check.checkAmountCents))
    setCurrency(check.currency || 'CAD')
    setCounterparty(check.checkType === 'received' ? (check.senderName ?? '') : (check.recipientName ?? ''))
    setStatus(check.status as typeof status)
    setNotes(check.notes ?? '')
  }, [check])

  if (!check) return null

  const isReceived = check.checkType === 'received'
  const isLocked = check.status === 'accepted' || check.status === 'cancelled'

  const handleSave = async () => {
    const cents = centsFromDollars(amountDollars)
    if (cents === null || cents <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive amount.', variant: 'destructive' })
      return
    }
    const payload: UpdateCheckPayload = {
      checkNumber: checkNumber.trim() || undefined,
      checkDate: checkDate || undefined,
      checkAmountCents: cents,
      currency: currency || undefined,
      notes: notes.trim() || undefined,
      status,
    }
    if (isReceived) payload.senderName = counterparty.trim() || undefined
    else payload.recipientName = counterparty.trim() || undefined

    try {
      await update.mutateAsync({ id: check.id, data: payload })
      toast({ title: 'Check updated' })
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Update failed'
      toast({ title: 'Update failed', description: msg, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit commission check</DialogTitle>
          <DialogDescription>
            {isLocked
              ? `This check is ${check.status}. The server will reject edits unless you transition it back first.`
              : 'Update the editable fields. To void this check, change status to Cancelled.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="check-number">Check #</Label>
              <Input id="check-number" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="check-date">Date</Label>
              <Input
                id="check-date"
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="check-amount">Amount</Label>
              <Input
                id="check-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="check-currency">Currency</Label>
              <Input
                id="check-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="check-counterparty">{isReceived ? 'Sender (Supplier)' : 'Recipient (Agent)'}</Label>
            <Input
              id="check-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="check-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger id="check-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="cancelled">Cancelled (void)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="check-notes">Notes</Label>
            <Input id="check-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
