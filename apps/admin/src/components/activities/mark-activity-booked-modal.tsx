'use client'

/**
 * Mark Activity as Booked Modal
 *
 * Modal dialog for marking an activity as booked/confirmed.
 * Sets bookingStatus='booked' and records the booking date.
 *
 * This is separate from the booking system modal - this tracks
 * when activities are confirmed/booked directly on the activity.
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Button } from '@/components/ui/button'
import { Check, Loader2, CalendarCheck } from 'lucide-react'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { Badge } from '@/components/ui/badge'

// Form validation schema
const markActivityBookedSchema = z.object({
  bookingDate: z.string().min(1, 'Booking date is required'),
})

type MarkActivityBookedFormValues = z.infer<typeof markActivityBookedSchema>

interface MarkActivityBookedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityName: string
  isBooked: boolean
  currentBookingDate: string | null
  onConfirm: (bookingDate: string) => Promise<void>
  isPending?: boolean
}

export function MarkActivityBookedModal({
  open,
  onOpenChange,
  activityName,
  isBooked,
  currentBookingDate,
  onConfirm,
  isPending = false,
}: MarkActivityBookedModalProps) {
  const [rootError, setRootError] = useState<string | null>(null)
  const { toast } = useToast()

  const form = useForm<MarkActivityBookedFormValues>({
    resolver: zodResolver(markActivityBookedSchema),
    defaultValues: {
      bookingDate: new Date().toISOString().split('T')[0], // Default to today
    },
  })

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setRootError(null)
      form.reset({
        bookingDate: currentBookingDate
          ? currentBookingDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
      })
    }
  }, [open, form, currentBookingDate])

  const onSubmit = async (data: MarkActivityBookedFormValues) => {
    setRootError(null)

    try {
      await onConfirm(data.bookingDate)

      toast({
        title: 'Activity marked as booked',
        description: `"${activityName}" has been marked as booked.`,
      })

      onOpenChange(false)
    } catch (error) {
      if (error instanceof ApiError) {
        setRootError(error.message || 'Failed to mark activity as booked.')
      } else {
        setRootError('Failed to mark activity as booked. Please try again.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-green-600" />
            Mark as Booked
          </DialogTitle>
          <DialogDescription>
            Confirm this activity by specifying when it was booked.
          </DialogDescription>
        </DialogHeader>

        {isBooked ? (
          <div className="py-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-4 w-4" />
                <p className="font-medium">Already Booked</p>
              </div>
              <p>
                This activity was marked as booked on{' '}
                {currentBookingDate
                  ? new Date(currentBookingDate).toLocaleDateString()
                  : 'an unknown date'}
                .
              </p>
              <p className="mt-2 text-xs text-green-600">
                You can update the booking date below if needed.
              </p>
            </div>
          </div>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="bookingDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Booking Date *</FormLabel>
                  <FormControl>
                    <DatePickerEnhanced
                      value={field.value || null}
                      onChange={(date) => field.onChange(date || '')}
                      placeholder="Select booking date"
                    />
                  </FormControl>
                  <FormDescription>
                    When was this activity booked/confirmed?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {rootError && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {rootError}
              </div>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {isBooked ? 'Update Booking Date' : 'Mark as Booked'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Booking Status Badge
 *
 * Shows the current booking status of an activity.
 * Can be clicked to open the Mark as Booked modal.
 */
interface BookingStatusBadgeProps {
  isBooked: boolean
  bookingDate: string | null
  onClick?: () => void
}

export function BookingStatusBadge({ isBooked, bookingDate, onClick }: BookingStatusBadgeProps) {
  if (isBooked) {
    return (
      <Badge
        variant="default"
        className="bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
        onClick={onClick}
      >
        <Check className="h-3 w-3 mr-1" />
        Booked
        {bookingDate && (
          <span className="ml-1 opacity-75">
            ({new Date(bookingDate).toLocaleDateString()})
          </span>
        )}
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="text-gray-600 hover:bg-gray-100 cursor-pointer"
      onClick={onClick}
    >
      Not Booked
    </Badge>
  )
}
