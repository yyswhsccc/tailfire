'use client'

/**
 * BookingHeaderButton — Shared booking control for all 9 activity form headers
 *
 * Renders one of five states:
 *   1. Not saved yet (activityId is null)  -> disabled "Save first to book"
 *   2. Child of package                    -> read-only badge with link to parent
 *   3. Unbooked                            -> amber "Mark as Booked" button
 *   4. Confirming (validation passed)      -> inline confirmation panel
 *   5. Booked                              -> green dropdown with "Remove Booking"
 *
 * Uses the validate-then-confirm flow:
 *   click -> validate -> show errors OR show confirmation -> confirm -> done
 */

import { useState } from 'react'
import { format } from 'date-fns'
import {
  CalendarCheck,
  Check,
  Loader2,
  ChevronDown,
  Link2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
  useMarkActivityBooked,
  useUnmarkActivityBooked,
  useValidateBooking,
} from '@/hooks/use-activity-bookings'
import type { BookingValidationError } from '@/hooks/use-activity-bookings'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BookingHeaderButtonProps {
  activityId: string | null // null = not saved yet
  activityName: string
  activityType: string // DB value: 'flight', 'lodging', 'custom_cruise', etc.
  isBooked: boolean
  bookingDate: string | null
  isChildOfPackage: boolean
  parentPackageId?: string | null
  parentPackageName?: string | null
  tripId: string
  /** Switch to a specific tab in the parent form */
  onNavigateToTab?: (tab: string) => void
  /** Called after successful booking */
  onBooked?: (cascadedCount?: number) => void
  /** Called after successful unbooking */
  onUnbooked?: () => void
}

// ---------------------------------------------------------------------------
// Error code -> tab mapping
// ---------------------------------------------------------------------------

/** Activity types whose pricing fields live on a dedicated "pricing" tab */
const PRICING_TAB_FORMS = new Set([
  'custom_cruise',
  'dining',
  'options',
  'transportation',
  'port_info',
])

function getTabForError(code: string, activityType: string): string {
  const pricingFields = new Set([
    'SUPPLIER_MISSING',
    'PRICE_MISSING',
    'PAYMENT_SCHEDULE_MISSING',
    'PAYMENT_ITEMS_MISSING',
    'PAYMENT_DUE_DATE_MISSING',
    'CONFIRMATION_NUMBER_MISSING',
    'FINAL_PAYMENT_AFTER_DEPARTURE',
    'NON_REFUNDABLE_NOT_SET',
    'NON_REFUNDABLE_EXCEEDS_DEPOSIT',
    'BOOKING_DATE_MISSING',
  ])

  if (pricingFields.has(code)) {
    return PRICING_TAB_FORMS.has(activityType) ? 'pricing' : 'booking'
  }

  // dates, travelers, passports all live on the general tab
  return 'general'
}

// ---------------------------------------------------------------------------
// Error code -> field id mapping (for scroll-to-highlight)
// ---------------------------------------------------------------------------

const FIELD_MAP: Record<string, string> = {
  SUPPLIER_MISSING: 'supplier',
  START_DATE_MISSING: 'startDatetime',
  END_DATE_MISSING: 'endDatetime',
  PRICE_MISSING: 'totalPrice',
  CONFIRMATION_NUMBER_MISSING: 'confirmationNumber',
  PAYMENT_SCHEDULE_MISSING: 'paymentSchedule',
  NO_TRAVELERS: 'travelers',
}

function highlightField(fieldId: string) {
  const el = document.querySelector(`[data-field="${fieldId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-red-500')
    setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 5000)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingHeaderButton({
  activityId,
  activityName,
  activityType,
  isBooked,
  bookingDate,
  isChildOfPackage,
  parentPackageId,
  parentPackageName,
  tripId,
  onNavigateToTab,
  onBooked,
  onUnbooked,
}: BookingHeaderButtonProps) {
  const { toast } = useToast()

  // Mutations & validation
  const validateBooking = useValidateBooking()
  const markBooked = useMarkActivityBooked()
  const unmarkBooked = useUnmarkActivityBooked()

  // Confirmation panel state
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [passportVerified, setPassportVerified] = useState(false)
  const [bookingDateInput, setBookingDateInput] = useState(
    () => new Date().toISOString().split('T')[0]
  )

  // ------- Handlers -------

  async function handleValidate() {
    if (!activityId) return

    try {
      const result = await validateBooking.mutateAsync(activityId)

      if (result.valid) {
        // Reset confirmation state each time we open it
        setPassportVerified(false)
        setBookingDateInput(bookingDate || new Date().toISOString().split('T')[0])
        setShowConfirmation(true)
      } else {
        // Navigate to the first error's tab
        const firstError = result.errors[0]
        if (firstError) {
          const tab = getTabForError(firstError.code, activityType)
          onNavigateToTab?.(tab)

          const field = FIELD_MAP[firstError.code]
          if (field) {
            // Delay to allow tab switch animation
            setTimeout(() => highlightField(field), 300)
          }
        }

        // Toast all errors
        toast({
          title: `${result.errors.length} booking requirement${result.errors.length > 1 ? 's' : ''} not met`,
          description: result.errors.map((e: BookingValidationError) => e.message).join(' \u2022 '),
          variant: 'destructive',
          duration: 10000,
        })
      }
    } catch (err) {
      toast({
        title: 'Validation failed',
        description: (err as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function handleConfirm() {
    if (!activityId) return

    try {
      const response = await markBooked.mutateAsync({
        activityId,
        data: {
          bookingDate: bookingDateInput,
          passportVerified: true,
        },
      })

      setShowConfirmation(false)

      const cascadedCount = response.cascadedCount
      if (cascadedCount && cascadedCount > 0) {
        toast({
          title: 'Package booked',
          description: `"${activityName}" and ${cascadedCount} child activit${cascadedCount === 1 ? 'y' : 'ies'} marked as booked.`,
        })
      } else {
        toast({
          title: 'Activity booked',
          description: `"${activityName}" has been marked as booked.`,
        })
      }

      onBooked?.(cascadedCount)
    } catch (err) {
      toast({
        title: 'Booking failed',
        description: (err as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function handleUnbook() {
    if (!activityId) return

    try {
      await unmarkBooked.mutateAsync(activityId)

      toast({
        title: 'Booking removed',
        description: `"${activityName}" is no longer marked as booked.`,
      })

      onUnbooked?.()
    } catch (err) {
      toast({
        title: 'Failed to remove booking',
        description: (err as Error).message,
        variant: 'destructive',
      })
    }
  }

  // ------- State 1: Not saved yet -------

  if (!activityId) {
    return (
      <Button variant="outline" disabled className="gap-2 text-gray-400">
        <CalendarCheck className="h-4 w-4" />
        Save first to book
      </Button>
    )
  }

  // ------- State 2: Child of package -------

  if (isChildOfPackage) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            isBooked
              ? 'border-green-500 text-green-700 gap-1'
              : 'gap-1'
          }
        >
          {isBooked ? (
            <Check className="h-3 w-3" />
          ) : (
            <CalendarCheck className="h-3 w-3" />
          )}
          {isBooked ? 'Booked via Package' : 'Managed by Package'}
        </Badge>
        {parentPackageId && (
          <a
            href={`/trips/${tripId}/activities/${parentPackageId}/edit?type=package`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <Link2 className="h-3 w-3" />
            Go to {parentPackageName || 'Package'}
          </a>
        )}
      </div>
    )
  }

  // ------- State 5: Booked -------

  if (isBooked) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
            Booked{bookingDate ? ` \u2014 ${format(new Date(bookingDate), 'MMM d, yyyy')}` : ''}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={handleUnbook}
            className="text-red-600"
          >
            Remove Booking
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // ------- State 3 & 4: Unbooked (+ optional confirmation panel) -------

  const isPending = validateBooking.isPending || markBooked.isPending

  return (
    <div>
      <Button
        variant="outline"
        onClick={handleValidate}
        disabled={isPending}
        className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarCheck className="h-4 w-4" />
        )}
        Mark as Booked
      </Button>

      {/* State 4: Confirmation panel */}
      {showConfirmation && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                All checks passed
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="passport-verified"
                checked={passportVerified}
                onCheckedChange={(v) => setPassportVerified(!!v)}
              />
              <Label htmlFor="passport-verified" className="text-sm">
                Passports verified
              </Label>
            </div>

            <Input
              type="date"
              value={bookingDateInput}
              onChange={(e) => setBookingDateInput(e.target.value)}
              className="w-40 h-8"
            />

            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!passportVerified || markBooked.isPending}
            >
              {markBooked.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Confirm Booking
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowConfirmation(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
