'use client'

/**
 * Booking Form Sheet
 *
 * Side panel form for EDITING existing bookings only.
 * Bookings are created through activity forms, not from this sheet.
 * Uses the bookings API with proper validation.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { PackageResponseDto, PackageStatus, PackagePaymentStatus } from '@tailfire/shared-types'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { useUpdateBooking } from '@/hooks/use-bookings'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { dollarsToCents } from '@/lib/pricing/currency-helpers'

// Form validation schema
// Proposal status uses ActivityProposalStatus values: draft, proposing, approved, cancelled
const bookingFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  confirmationNumber: z.string().max(255).optional().nullable(),
  supplierName: z.string().max(255).optional().nullable(),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']),
  paymentStatus: z.enum(['unpaid', 'deposit_paid', 'paid', 'refunded', 'partially_refunded']),
  pricingType: z.enum(['flat_rate', 'per_person']),
  travelerCount: z.number().int().min(1).default(1),
  totalPriceDollars: z.number().min(0).default(0),
  taxesDollars: z.number().min(0).default(0),
  currency: z.string().length(3).default('CAD'),
  commissionDollars: z.number().min(0).optional().nullable(),
  commissionPercentage: z.number().min(0).max(100).optional().nullable(),
  depositDollars: z.number().min(0).optional().nullable(),
  depositDueDate: z.string().optional().nullable(),
  finalPaymentDueDate: z.string().optional().nullable(),
  cancellationPolicy: z.string().optional().nullable(),
  cancellationDeadline: z.string().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

type BookingFormValues = z.infer<typeof bookingFormSchema>

interface BookingFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  booking?: PackageResponseDto | null
  currency?: string
}

// Convert cents to dollars for form defaults (returns number, not string)
// Note: canonical centsToDollars returns string, but form needs number
const centsToDollars = (cents: number | null | undefined): number => {
  if (cents == null) return 0
  return cents / 100
}

// Narrow PricingType to package-allowed values
const toPackagePricingType = (
  value: string | null | undefined
): 'flat_rate' | 'per_person' => {
  if (value === 'flat_rate' || value === 'per_person') return value
  return 'flat_rate' // Default for unsupported values
}

export function BookingFormSheet({
  open,
  onOpenChange,
  tripId,
  booking,
  currency = 'CAD',
}: BookingFormSheetProps) {
  const [rootError, setRootError] = useState<string | null>(null)
  const updateBooking = useUpdateBooking()
  const { toast } = useToast()

  // This form is edit-only. Bookings are created through activity forms.
  // If no booking provided, the sheet should not be opened.

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      name: '',
      confirmationNumber: null,
      supplierName: null,
      proposalStatus: 'draft',
      paymentStatus: 'unpaid',
      pricingType: 'flat_rate',
      travelerCount: 1,
      totalPriceDollars: 0,
      taxesDollars: 0,
      currency,
      commissionDollars: null,
      commissionPercentage: null,
      depositDollars: null,
      depositDueDate: null,
      finalPaymentDueDate: null,
      cancellationPolicy: null,
      cancellationDeadline: null,
      termsAndConditions: null,
      notes: null,
    },
  })

  // Reset form when booking changes or dialog opens
  // Package-specific fields are now nested in packageDetails
  useEffect(() => {
    if (open && booking) {
      setRootError(null)
      const details = booking.packageDetails
      form.reset({
        name: booking.name,
        confirmationNumber: booking.confirmationNumber,
        supplierName: details?.supplierName ?? null,
        proposalStatus: booking.proposalStatus,
        paymentStatus: details?.paymentStatus ?? 'unpaid',
        pricingType: toPackagePricingType(details?.pricingType),
        travelerCount: booking.travelers?.length ?? 1,
        totalPriceDollars: centsToDollars(booking.pricing?.totalPriceCents ?? booking.totalPriceCents),
        taxesDollars: centsToDollars(booking.pricing?.taxesAndFeesCents),
        currency: booking.pricing?.currency ?? booking.currency,
        commissionDollars: centsToDollars(booking.pricing?.commissionTotalCents),
        commissionPercentage: booking.pricing?.commissionSplitPercentage ?? null,
        depositDollars: null, // Deposit handled through payment schedules
        depositDueDate: null,
        finalPaymentDueDate: null,
        cancellationPolicy: details?.cancellationPolicy ?? null,
        cancellationDeadline: details?.cancellationDeadline ?? null,
        termsAndConditions: details?.termsAndConditions ?? null,
        notes: booking.notes,
      })
    }
  }, [open, booking, form])

  const onSubmit = async (data: BookingFormValues) => {
    if (!booking) {
      // This form is edit-only. Should not reach here without a booking.
      return
    }

    setRootError(null)

    try {
      const payload = {
        tripId,
        name: data.name,
        confirmationNumber: data.confirmationNumber || null,
        supplierName: data.supplierName || null,
        proposalStatus: data.proposalStatus as PackageStatus,
        paymentStatus: data.paymentStatus as PackagePaymentStatus,
        pricingType: data.pricingType,
        travelerCount: data.travelerCount,
        totalPriceCents: dollarsToCents(data.totalPriceDollars),
        taxesCents: dollarsToCents(data.taxesDollars),
        currency: data.currency,
        commissionCents: data.commissionDollars ? dollarsToCents(data.commissionDollars) : null,
        commissionPercentage: data.commissionPercentage || null,
        depositCents: data.depositDollars ? dollarsToCents(data.depositDollars) : null,
        depositDueDate: data.depositDueDate || null,
        finalPaymentDueDate: data.finalPaymentDueDate || null,
        cancellationPolicy: data.cancellationPolicy || null,
        cancellationDeadline: data.cancellationDeadline || null,
        termsAndConditions: data.termsAndConditions || null,
        notes: data.notes || null,
      }

      await updateBooking.mutateAsync({ id: booking.id, data: payload })
      toast({
        title: 'Booking updated',
        description: 'The booking has been successfully updated.',
      })

      onOpenChange(false)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setRootError('A booking with this confirmation number already exists for this trip.')
        } else {
          setRootError(error.message || 'Failed to save booking.')
        }
      } else {
        setRootError('Failed to save booking. Please try again.')
      }
    }
  }

  const isPending = updateBooking.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>Edit Booking</SheetTitle>
          <SheetDescription>
            Update the booking details below. Bookings are created from activity forms.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <Form {...form}>
            <form id="booking-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Booking Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Hotel Package, Flight Bundle" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="confirmationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmation #</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., ABC123"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplierName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Hilton Hotels"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Status */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Status</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="proposalStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Booking Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="proposing">Proposing</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                            <SelectItem value="deposit_paid">Deposit Paid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="refunded">Refunded</SelectItem>
                            <SelectItem value="partially_refunded">Partially Refunded</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Pricing */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Pricing</h3>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="pricingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pricing Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="flat_rate">Flat Rate</SelectItem>
                            <SelectItem value="per_person">Per Person</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="travelerCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travelers</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="totalPriceDollars"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Price</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="taxesDollars"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taxes & Fees</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CAD">CAD</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Commission */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Commission</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="commissionDollars"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commission Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="commissionPercentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commission %</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            placeholder="10.00"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Payment Schedule */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Payment Schedule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="depositDollars"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deposit Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="depositDueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deposit Due Date</FormLabel>
                        <FormControl>
                          <DatePickerEnhanced
                            value={field.value || null}
                            onChange={(date) => field.onChange(date || '')}
                            placeholder="Select deposit due date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="finalPaymentDueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Final Payment Due Date</FormLabel>
                      <FormControl>
                        <DatePickerEnhanced
                          value={field.value || null}
                          onChange={(date) => field.onChange(date || '')}
                          placeholder="Select final payment due date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Policies */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Policies</h3>

                <FormField
                  control={form.control}
                  name="cancellationDeadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cancellation Deadline</FormLabel>
                      <FormControl>
                        <DatePickerEnhanced
                          value={field.value || null}
                          onChange={(date) => field.onChange(date || '')}
                          placeholder="Select cancellation deadline"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cancellationPolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cancellation Policy</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter cancellation policy details..."
                          rows={3}
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="termsAndConditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms & Conditions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter terms and conditions..."
                          rows={3}
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Internal notes about this booking..."
                        rows={3}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      For internal use only. Not visible to clients.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Root Error */}
              {rootError && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {rootError}
                </div>
              )}
            </form>
          </Form>
        </ScrollArea>

        <SheetFooter className="pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="booking-form" disabled={isPending}>
            {isPending ? 'Saving...' : 'Update Booking'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
