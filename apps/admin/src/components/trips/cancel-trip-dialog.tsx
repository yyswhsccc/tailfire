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
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useCancelTrip } from '@/hooks/use-trips'

const REASON_PRESETS = [
  'Client requested cancellation',
  'Supplier unable to fulfill booking',
  'Travel advisory / force majeure',
  'Pricing or availability change',
]

interface CancelTripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  tripName: string
}

export function CancelTripDialog({
  open,
  onOpenChange,
  tripId,
  tripName,
}: CancelTripDialogProps) {
  const [reason, setReason] = useState('')
  const [notifyTravelers, setNotifyTravelers] = useState(false)
  const cancelTrip = useCancelTrip()
  const { toast } = useToast()

  const handleCancel = async () => {
    if (!reason.trim()) return

    try {
      await cancelTrip.mutateAsync({ tripId, reason: reason.trim(), notifyTravelers })
      toast({
        title: 'Trip cancelled',
        description: `"${tripName}" has been cancelled.`,
      })
      onOpenChange(false)
      setReason('')
      setNotifyTravelers(false)
    } catch (error: any) {
      toast({
        title: 'Failed to cancel trip',
        description: error?.message || 'An error occurred.',
        variant: 'destructive',
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Trip</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel &ldquo;{tripName}&rdquo;? This action cannot be undone. Payments recorded against this trip will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="cancel-reason">Cancellation Reason</Label>
          <div className="flex flex-wrap gap-2">
            {REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  reason === preset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            id="cancel-reason"
            placeholder="Enter or select a cancellation reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-center space-x-2 pt-1">
          <Checkbox
            id="notify-travelers"
            checked={notifyTravelers}
            onCheckedChange={(checked) => setNotifyTravelers(checked === true)}
          />
          <Label htmlFor="notify-travelers" className="text-sm font-normal cursor-pointer">
            Send cancellation notice to travelers
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setReason(''); setNotifyTravelers(false) }}>
            Keep Trip
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={!reason.trim() || cancelTrip.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelTrip.isPending ? 'Cancelling...' : 'Cancel Trip'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
