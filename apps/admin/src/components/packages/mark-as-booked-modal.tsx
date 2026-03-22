'use client'

/**
 * Mark as Booked Modal
 *
 * Modal dialog for marking a booking as confirmed/booked.
 * Requires confirmation number and optionally date booked and payment status.
 *
 * State machine: Only draft/pending bookings can be marked as booked.
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMarkAsBooked } from '@/hooks/use-bookings'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Form validation schema
const markAsBookedSchema = z.object({
  confirmationNumber: z.string().min(1, 'Confirmation number is required'),
  dateBooked: z.string().optional(),
  paymentStatus: z.enum(['unpaid', 'deposit_paid', 'paid']).optional(),
})

type MarkAsBookedFormValues = z.infer<typeof markAsBookedSchema>

interface MarkAsBookedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string | null
  bookingName: string
  currentStatus: string
  onSuccess?: () => void
}

export function MarkAsBookedModal({
  open,
  onOpenChange,
  bookingId,
  bookingName,
  currentStatus,
  onSuccess,
}: MarkAsBookedModalProps) {
  const [rootError, setRootError] = useState<string | null>(null)
  const [bookingErrors, setBookingErrors] = useState<string[]>([])
  const [passportVerified, setPassportVerified] = useState(false)
  const [nonRefundableDeposit, setNonRefundableDeposit] = useState(false)
  const [nonRefundableAmount, setNonRefundableAmount] = useState<number>(0)
  const markAsBooked = useMarkAsBooked()
  const { toast } = useToast()

  // Check if booking can be marked as booked
  const canMarkAsBooked = ['draft', 'pending'].includes(currentStatus)

  const form = useForm<MarkAsBookedFormValues>({
    resolver: zodResolver(markAsBookedSchema),
    defaultValues: {
      confirmationNumber: '',
      dateBooked: new Date().toISOString().split('T')[0], // Default to today
      paymentStatus: undefined,
    },
  })

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setRootError(null)
      setBookingErrors([])
      setPassportVerified(false)
      setNonRefundableDeposit(false)
      setNonRefundableAmount(0)
      form.reset({
        confirmationNumber: '',
        dateBooked: new Date().toISOString().split('T')[0],
        paymentStatus: undefined,
      })
    }
  }, [open, form])

  const onSubmit = async (data: MarkAsBookedFormValues) => {
    if (!bookingId) return

    setRootError(null)
    setBookingErrors([])

    try {
      await markAsBooked.mutateAsync({
        bookingId,
        data: {
          confirmationNumber: data.confirmationNumber,
          bookingDate: data.dateBooked || undefined,
          paymentStatus: data.paymentStatus || undefined,
        },
      })

      toast({
        title: 'Booking confirmed',
        description: `"${bookingName}" has been marked as booked with confirmation #${data.confirmationNumber}.`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors && error.errors.length > 0) {
          setBookingErrors(error.errors)
        } else if (error.status === 400) {
          setRootError(error.message || 'This booking cannot be marked as booked.')
        } else if (error.status === 409) {
          setRootError('A booking with this confirmation number already exists for this trip.')
        } else {
          setRootError(error.message || 'Failed to mark booking as booked.')
        }
      } else {
        setRootError('Failed to mark booking as booked. Please try again.')
      }
    }
  }

  const isPending = markAsBooked.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mark as Booked</DialogTitle>
          <DialogDescription>
            Confirm this booking by providing the confirmation number from the supplier.
          </DialogDescription>
        </DialogHeader>

        {!canMarkAsBooked ? (
          <div className="py-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <p className="font-medium">Cannot mark as booked</p>
              <p className="mt-1">
                Only bookings with status &quot;Draft&quot; or &quot;Pending&quot; can be marked as booked.
                This booking has status &quot;{currentStatus}&quot;.
              </p>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="confirmationNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmation Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., ABC-12345" {...field} />
                    </FormControl>
                    <FormDescription>
                      The confirmation number provided by the supplier.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateBooked"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Booked</FormLabel>
                    <FormControl>
                      <DatePickerEnhanced
                        value={field.value || null}
                        onChange={(date) => field.onChange(date || '')}
                        placeholder="Select booking date"
                      />
                    </FormControl>
                    <FormDescription>
                      When was this booking confirmed? Defaults to today.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Status (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Keep current status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="deposit_paid">Deposit Paid</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optionally update the payment status.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="passport-verified"
                  checked={passportVerified}
                  onCheckedChange={(checked) => setPassportVerified(checked === true)}
                />
                <Label htmlFor="passport-verified">
                  I have verified all traveler passports are valid
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="non-refundable-deposit"
                  checked={nonRefundableDeposit}
                  onCheckedChange={(checked) => setNonRefundableDeposit(checked === true)}
                />
                <Label htmlFor="non-refundable-deposit">
                  Deposit includes a non-refundable amount
                </Label>
              </div>

              {nonRefundableDeposit && (
                <div className="space-y-2">
                  <Label>Non-refundable amount</Label>
                  <Input
                    type="number"
                    value={nonRefundableAmount}
                    onChange={(e) => setNonRefundableAmount(Number(e.target.value))}
                    placeholder="Pre-filled with deposit amount"
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount included in the deposit that is non-refundable
                  </p>
                </div>
              )}

              {bookingErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Booking requirements not met</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                      {bookingErrors.map((error, i) => (
                        <li key={i} className="text-sm">{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {rootError && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {rootError}
                </div>
              )}
            </form>
          </Form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          {canMarkAsBooked && (
            <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Mark as Booked
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
