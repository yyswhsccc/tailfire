'use client'

/**
 * CheckEditDialog — admin row-level edit for a commission check.
 *
 * Reuses the existing PATCH /commission/checks/:id endpoint. The server
 * enforces that accepted/cancelled checks can't be edited (BadRequest) so
 * we mostly hide the trigger for those rows; the dialog still shows a
 * helpful error if the server rejects.
 *
 * Counterparty/currency fields are driven by the shared
 * CheckCounterpartyFields subcomponent so this dialog and the Receive
 * Deposit form stay aligned. Received checks pick a supplier (FK);
 * paid checks (to agents) keep the legacy free-text recipient input.
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
import {
  CheckCounterpartyFields,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from './check-counterparty-fields'

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

function normalizeCurrency(c: string | null | undefined): SupportedCurrency {
  const upper = (c || 'CAD').toUpperCase()
  const known = SUPPORTED_CURRENCIES.find((sc) => sc.code === upper)
  return (known?.code ?? 'CAD') as SupportedCurrency
}

export function CheckEditDialog({ check, open, onOpenChange }: Props) {
  const update = useUpdateCheck()
  const { toast } = useToast()

  // Local form state — hydrated from the row each time the dialog opens.
  const [checkNumber, setCheckNumber] = useState('')
  const [checkDate, setCheckDate] = useState('')
  const [amountDollars, setAmountDollars] = useState('')
  const [currency, setCurrency] = useState<SupportedCurrency>('CAD')

  // Received-check counterparty
  const [senderSupplierId, setSenderSupplierId] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('')

  // Paid-check counterparty (free-text agent name — agents are users, not
  // suppliers; no FK picker is appropriate here)
  const [recipientName, setRecipientName] = useState('')

  const [status, setStatus] = useState<'pending' | 'submitted' | 'accepted' | 'cancelled'>('pending')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!check) return
    setCheckNumber(check.checkNumber)
    setCheckDate(check.checkDate.slice(0, 10))
    setAmountDollars(dollarsFromCents(check.checkAmountCents))
    setCurrency(normalizeCurrency(check.currency))
    setSenderSupplierId(check.senderSupplierId ?? null)
    setSenderName(check.senderName ?? '')
    setRecipientName(check.recipientName ?? '')
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
    // Supplier is required on received checks — reporting depends on the FK.
    if (isReceived && !senderSupplierId) {
      toast({
        title: 'Supplier required',
        description: 'Pick the supplier this check came from — reporting depends on it.',
        variant: 'destructive',
      })
      return
    }

    const payload: UpdateCheckPayload = {
      checkNumber: checkNumber.trim() || undefined,
      checkDate: checkDate || undefined,
      checkAmountCents: cents,
      currency,
      notes: notes.trim() || undefined,
      status,
    }
    if (isReceived) {
      payload.senderSupplierId = senderSupplierId ?? undefined
      payload.senderName = senderName.trim() || undefined
    } else {
      payload.recipientName = recipientName.trim() || undefined
    }

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

          {isReceived ? (
            <CheckCounterpartyFields
              supplierId={senderSupplierId}
              onSupplierIdChange={setSenderSupplierId}
              senderName={senderName}
              onSenderNameChange={setSenderName}
              currency={currency}
              onCurrencyChange={setCurrency}
              required
            />
          ) : (
            <>
              <div>
                <Label htmlFor="check-recipient">Recipient (Agent)</Label>
                <Input
                  id="check-recipient"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="check-currency-paid">Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
                  <SelectTrigger id="check-currency-paid">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

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
          {/*
            The server rejects edits to accepted/cancelled checks with a
            400. Disable Save in that case so we don't promise an update
            we can't deliver. To edit such a check, the admin must first
            recall (accepted → submitted) or unblock the row through
            another flow.
          */}
          <Button
            onClick={handleSave}
            disabled={update.isPending || isLocked}
            title={isLocked ? `This check is ${check.status} — recall it before editing.` : undefined}
          >
            {update.isPending ? 'Saving…' : isLocked ? `Locked (${check.status})` : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
