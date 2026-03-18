'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { PendingReceivableDto } from '@tailfire/shared-types/api'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

interface MatchItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PendingReceivableDto | null
  onConfirm: (activityPricingId: string, receivedCents: number, taxCents: number) => void
}

export function MatchItemDialog({ open, onOpenChange, item, onConfirm }: MatchItemDialogProps) {
  const [receivedDollars, setReceivedDollars] = useState('')
  const [taxDollars, setTaxDollars] = useState('0')

  // Reset form values when the item changes
  useEffect(() => {
    if (item) {
      setReceivedDollars((item.expectedCommissionCents / 100).toFixed(2))
      setTaxDollars('0')
    }
  }, [item])

  if (!item) return null

  const handleConfirm = () => {
    const received = parseFloat(receivedDollars)
    const tax = parseFloat(taxDollars)

    if (isNaN(received) || received < 0) return
    if (isNaN(tax) || tax < 0) return

    const receivedCents = Math.round(received * 100)
    const taxCents = Math.round(tax * 100)

    onConfirm(item.activityPricingId, receivedCents, taxCents)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Match Receivable</DialogTitle>
          <DialogDescription>
            Confirm the received commission amount for this booking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item details */}
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking Ref</span>
              <span className="font-mono">{item.confirmationNumber || item.bookingReference || '\u2014'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trip</span>
              <a
                href={`/trips/${item.tripId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[200px] truncate text-right text-blue-600 hover:underline"
              >
                {item.tripName}
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Passengers</span>
              <span className="max-w-[200px] truncate text-right">
                {item.passengerNames.length > 0 ? item.passengerNames.join(', ') : '\u2014'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected Commission</span>
              <span className="font-medium">{formatCurrency(item.expectedCommissionCents)}</span>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="receivedAmount">Received Amount (CAD)</Label>
              <Input
                id="receivedAmount"
                type="number"
                step="0.01"
                min="0"
                value={receivedDollars}
                onChange={(e) => setReceivedDollars(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxAmount">Tax Amount (CAD)</Label>
              <Input
                id="taxAmount"
                type="number"
                step="0.01"
                min="0"
                value={taxDollars}
                onChange={(e) => setTaxDollars(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
