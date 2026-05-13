'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { Ship, ChevronDown, ChevronUp, Sparkles, Loader2, Check, AlertCircle, DollarSign, FileText, ImageIcon, Calendar, Anchor, RefreshCw, Plus, Trash2 } from 'lucide-react'
import type { ActivityResponseDto } from '@tailfire/shared-types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { ActivityCommentsPanel } from '@/components/activities/activity-comments-panel'
import { useCreateCustomCruise, useUpdateCustomCruise, useCustomCruise, useGenerateCruisePortSchedule, useCruisePortSchedule } from '@/hooks/use-custom-cruise'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { useBookings } from '@/hooks/use-bookings'
import { useQueryClient } from '@tanstack/react-query'
import { BookingHeaderButton } from '@/components/activities/booking-header-button'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { CruisePassengersSection } from './cruise-passengers-section'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { Combobox } from '@/components/ui/combobox'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { centsToDollars, dollarsToCents } from '@/lib/pricing/currency-helpers'
import { useMyProfile } from '@/hooks/use-user-profile'
import { PaymentScheduleSection } from './payment-schedule-section'
import { type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { Separator } from '@/components/ui/separator'
import { useCruiseLineOptions, useCruiseShipOptions, useCruiseRegionOptions, useCruisePortOptions } from '@/hooks/use-traveltek-reference'
import {
  customCruiseFormSchema,
  toCustomCruiseDefaults,
  toCustomCruiseApiPayload,
  CUSTOM_CRUISE_FORM_FIELDS,
  type CustomCruiseFormData,
} from '@/lib/validation/cruise-validation'
import { mapServerErrors, scrollToFirstError, formatFieldLabel, type ServerFieldError } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint, findDayForDate, type DayInfo } from '@/lib/date-utils'

interface CustomCruiseFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  trip?: any
  onSuccess?: () => void
  onCancel?: () => void
  /** When true, user must select a date to determine which day to assign activity to */
  pendingDay?: boolean
  /** Optional days list for day selection when dayId is empty */
  days?: Array<{ id: string; dayNumber: number; date?: string | null; title?: string | null }>
}

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

// Valid proposal status values
const VALID_STATUSES = ['draft', 'proposing', 'approved', 'cancelled'] as const
type FormStatus = (typeof VALID_STATUSES)[number]

// Valid pricing types
const VALID_PRICING_TYPES = ['per_person', 'per_room', 'flat_rate', 'per_night', 'per_group', 'fixed', 'total'] as const
type FormPricingType = (typeof VALID_PRICING_TYPES)[number]

// Coerce API proposal status to form status
function coerceStatus(status: string | undefined | null): FormStatus {
  if (status && VALID_STATUSES.includes(status as FormStatus)) {
    return status as FormStatus
  }
  return 'draft'
}

// Coerce API pricing type to form pricing type
function coercePricingType(type: string | undefined | null): FormPricingType {
  if (type && VALID_PRICING_TYPES.includes(type as FormPricingType)) {
    return type as FormPricingType
  }
  return 'per_person'
}

export function CustomCruiseForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: CustomCruiseFormProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [showTravelersDialog, setShowTravelersDialog] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const { returnToItinerary } = useActivityNavigation()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    // Map 'booking' to 'pricing' since the actual tab is named 'pricing'
    return tabParam === 'booking' ? 'pricing' : 'general'
  })

  // Auto-determine dayId from departure date
  // The cruise activity should be attached to the day matching its departure date
  const [computedDayId, setComputedDayId] = useState<string>(dayId)
  const [departureDateMismatch, setDepartureDateMismatch] = useState(false)

  // Convert days prop to DayInfo[] for shared findDayForDate utility
  const daysAsDayInfo: DayInfo[] = useMemo(
    () => days.map((d) => ({ id: d.id, date: d.date ?? null, dayNumber: d.dayNumber })),
    [days]
  )

  // Helper to find day by date using shared TZ-safe utility
  const findDayByDate = useCallback(
    (dateStr: string | null | undefined): string | null => {
      const match = findDayForDate(dateStr, daysAsDayInfo)
      return match?.dayId ?? null
    },
    [daysAsDayInfo]
  )

  // Effective dayId - use prop if provided, otherwise computed from departure date
  // In edit mode (dayId provided), we lock to existing day; only auto-compute for new cruises
  const effectiveDayId = dayId || computedDayId
  const matchedDay = days.find((d) => d.id === computedDayId)
  // effectiveDayDate handles async loading: if dayDate prop is undefined (days query hadn't loaded
  // when page.tsx rendered), derive date from days array using dayId
  const effectiveDayDate = dayId
    ? (dayDate || days.find((d) => d.id === dayId)?.date || null)
    : matchedDay?.date || null

  // Track if we're in edit mode (has existing activity)
  const isEditMode = !!activity?.id

  // Reference data for comboboxes - track selected line UUID for ship filtering
  const [selectedCruiseLineId, setSelectedCruiseLineId] = useState<string | undefined>(undefined)
  const [isUploadingCabinImage, setIsUploadingCabinImage] = useState(false)
  const cruiseLineOptions = useCruiseLineOptions()
  const cruiseShipOptions = useCruiseShipOptions(selectedCruiseLineId)
  const cruiseRegionOptions = useCruiseRegionOptions()
  const cruisePortOptions = useCruisePortOptions()

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)


  // Activity pricing ID (gated on this for payment schedule)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // Package linkage state for PricingSection
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(activity?.packageId ?? null)
  const [pricingBreakdown, setPricingBreakdown] = useState<PricingBreakdownItem[] | null>(
    (activity as any)?.pricingBreakdownJson ?? null
  )
  const { data: packagesData } = useBookings({ tripId: trip?.id })
  const availablePackages = useMemo(
    () => packagesData?.map(pkg => ({ id: pkg.id, name: pkg.name })) ?? [],
    [packagesData]
  )

  // Check if this activity is a child of a package (pricing controlled by parent)
  const { isChildOfPackage, parentPackageName, parentPackageId } = useIsChildOfPackage(activity)

  // User profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Booking status state
  const [activityIsBooked, setActivityIsBooked] = useState(activity?.bookingStatus === 'booked')
  const [activityBookingDate, setActivityBookingDate] = useState<string | null>(activity?.bookingDate ?? null)
  const queryClient = useQueryClient()

  // Autosave was removed in #306. Form saves only via the manual Save Changes
  // button; the header "Unsaved changes" badge below reflects RHF isDirty.

  // Fetch cruise data (for edit mode)
  const { data: cruiseData } = useCustomCruise(activityId || '')

  // Mutations - use effectiveDayId for cache invalidation
  const createCustomCruise = useCreateCustomCruise(itineraryId, effectiveDayId)
  const updateCustomCruise = useUpdateCustomCruise(itineraryId, effectiveDayId)
  const generatePortSchedule = useGenerateCruisePortSchedule(itineraryId)

  // Query for existing port schedule
  const { data: portSchedule } = useCruisePortSchedule(activityId || undefined)

  // Trip month hint for date picker calendar default
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // ============================================================================
  // react-hook-form setup with Zod validation
  // ============================================================================

  const {
    control,
    register,
    reset,
    setError,
    clearErrors,
    setValue,
    getValues,
    watch,
    formState: { errors, isDirty },
  } = useForm<CustomCruiseFormData>({
    // No resolver - we'll validate manually with trigger() and custom validation
    // This prevents any validation from running during Controller registration
    defaultValues: toCustomCruiseDefaults(
      {
        itineraryDayId: effectiveDayId,
        proposalStatus: coerceStatus(activity?.proposalStatus),
        pricingType: coercePricingType((activity as any)?.pricingType),
        currency: trip?.currency || 'USD',
      },
      dayDate,
      trip?.currency
    ),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldUnregister: false,
  })

  // Ref to track loaded cruise ID (prevent re-seeding on same cruise)
  const cruiseIdRef = useRef<string | null>(null)


  // Counter to trigger auto-save effect when form changes
  const [changeCounter, setChangeCounter] = useState(0)

  // ============================================================================
  // Reusable validation function
  // ============================================================================

  const validateFormData = useCallback((formData: CustomCruiseFormData): { isValid: boolean; firstError?: { field: string; message: string } } => {
    const validationResult = customCruiseFormSchema.safeParse(formData)

    if (!validationResult.success) {
      // Clear previous errors and set new ones
      clearErrors()
      let firstError: { field: string; message: string } | undefined

      validationResult.error.errors.forEach((err, index) => {
        const path = err.path.join('.')
        setError(path as any, { message: err.message })
        // Capture first error for toast
        if (index === 0) {
          firstError = { field: path, message: err.message }
        }
      })

      return { isValid: false, firstError }
    }

    // Clear all errors when validation passes
    clearErrors()
    return { isValid: true }
  }, [setError, clearErrors])

  // ============================================================================
  // Hydrate form from server data when cruise loads
  // ============================================================================

  useEffect(() => {
    if (cruiseData && cruiseData.id !== cruiseIdRef.current) {
      cruiseIdRef.current = cruiseData.id
      setActivityId(cruiseData.id)
      setActivityPricingId(cruiseData.activityPricingId || null)

      // Reset form with server data
      // Note: coerce source to valid enum value, handle null/undefined dates
      const serverDetails = cruiseData.customCruiseDetails
      // For edit mode, use the existing activity's dayId; for new, compute from departure date
      const loadedDayId = cruiseData.itineraryDayId || effectiveDayId

      reset(
        toCustomCruiseDefaults(
          {
            itineraryDayId: loadedDayId,
            name: cruiseData.name,
            description: cruiseData.description ?? undefined,
            proposalStatus: coerceStatus(cruiseData.proposalStatus),
            pricingType: coercePricingType(cruiseData.pricingType),
            currency: cruiseData.currency || 'USD',
            totalPriceCents: cruiseData.totalPriceCents,
            taxesAndFeesCents: cruiseData.taxesAndFeesCents,
            confirmationNumber: cruiseData.confirmationNumber || '',
            commissionTotalCents: cruiseData.commissionTotalCents,
            commissionSplitPercentage: cruiseData.commissionSplitPercentage ? parseFloat(cruiseData.commissionSplitPercentage) : null,
            commissionExpectedDate: cruiseData.commissionExpectedDate ?? undefined,
            // Booking details
            termsAndConditions: cruiseData.termsAndConditions || '',
            cancellationPolicy: cruiseData.cancellationPolicy || '',
            supplier: cruiseData.supplier || '',
            customCruiseDetails: serverDetails ? {
              ...serverDetails,
              // Coerce source to valid enum (API might return null/undefined)
              source: (serverDetails.source === 'manual' || serverDetails.source === 'traveltek')
                ? serverDetails.source
                : 'manual',
              // Ensure required array/object fields have defaults
              portCallsJson: serverDetails.portCallsJson ?? [],
              cabinPricingJson: serverDetails.cabinPricingJson ?? {},
              shipContentJson: serverDetails.shipContentJson ?? {},
              inclusions: serverDetails.inclusions ?? [],
              diningPreferences: serverDetails.diningPreferences ?? {},
              selectedExtras: serverDetails.selectedExtras ?? [],
              selectedPromotions: serverDetails.selectedPromotions ?? {},
            } : undefined,
          },
          effectiveDayDate,
          trip?.currency
        ),
        { keepDirty: false }
      )

      // Force pricingData memo to recompute with hydrated values.
      // The watch subscription (set up in a later effect) hasn't been created yet
      // when this hydration runs, so reset() alone won't trigger changeCounter.
      setChangeCounter((c) => c + 1)

      // Initialize ship filtering based on loaded cruise line
      if (cruiseData.customCruiseDetails?.cruiseLineId) {
        setSelectedCruiseLineId(cruiseData.customCruiseDetails.cruiseLineId)
      }
    }
  }, [cruiseData, effectiveDayId, effectiveDayDate, reset, trip?.currency])

  // ============================================================================
  // Separate effect to subscribe to form changes and trigger auto-save counter
  // This runs AFTER render is complete, avoiding the setState-during-render error
  // ============================================================================

  useEffect(() => {
    // Skip the initial synchronous fire to avoid setState during render
    let isFirst = true

    // Subscribe to form changes using React Hook Form's watch API
    const subscription = watch(() => {
      if (isFirst) {
        isFirst = false
        return // skip the initial sync fire
      }
      // Increment counter to trigger auto-save effect
      // This happens after render is complete, avoiding the Controller error
      setChangeCounter((c) => c + 1)
    })

    return () => {
      if (typeof subscription?.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    }
  }, [watch])

  // ============================================================================
  // Auto-update itineraryDayId when departure date changes (for new cruises only)
  // In edit mode, we preserve the existing day association
  // ============================================================================

  // Watch departure date for auto-day computation
  const watchedDepartureDate = watch('customCruiseDetails.departureDate')

  // Watch custom component fields (Selects, DatePickers, TimePickers, Comboboxes, number inputs)
  const statusValue = useWatch({ control, name: 'proposalStatus' })
  // Cruise line and ship
  const cruiseLineNameValue = useWatch({ control, name: 'customCruiseDetails.cruiseLineName' })
  const shipNameValue = useWatch({ control, name: 'customCruiseDetails.shipName' })
  const shipImageUrlValue = useWatch({ control, name: 'customCruiseDetails.shipImageUrl' })

  // Auto-generate activity name from cruise line and ship name
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'custom_cruise',
    control,
    setValue,
    cruiseLineName: cruiseLineNameValue || undefined,
    shipName: shipNameValue || undefined,
  })
  // Voyage details
  const itineraryNameValue = useWatch({ control, name: 'customCruiseDetails.itineraryName' })
  const voyageCodeValue = useWatch({ control, name: 'customCruiseDetails.voyageCode' })
  const regionValue = useWatch({ control, name: 'customCruiseDetails.region' })
  const nightsValue = useWatch({ control, name: 'customCruiseDetails.nights' })
  const seaDaysValue = useWatch({ control, name: 'customCruiseDetails.seaDays' })
  // Departure
  const departurePortValue = useWatch({ control, name: 'customCruiseDetails.departurePort' })
  const departureDateValue = useWatch({ control, name: 'customCruiseDetails.departureDate' })
  const departureTimeValue = useWatch({ control, name: 'customCruiseDetails.departureTime' })
  const departureTimezoneValue = useWatch({ control, name: 'customCruiseDetails.departureTimezone' })
  // Arrival
  const arrivalPortValue = useWatch({ control, name: 'customCruiseDetails.arrivalPort' })
  const arrivalDateValue = useWatch({ control, name: 'customCruiseDetails.arrivalDate' })
  const arrivalTimeValue = useWatch({ control, name: 'customCruiseDetails.arrivalTime' })
  const arrivalTimezoneValue = useWatch({ control, name: 'customCruiseDetails.arrivalTimezone' })
  // Traveltek
  const traveltekCruiseIdValue = useWatch({ control, name: 'customCruiseDetails.traveltekCruiseId' })
  // Cabin details
  const cabinCategoryValue = useWatch({ control, name: 'customCruiseDetails.cabinCategory' })
  const cabinCodeValue = useWatch({ control, name: 'customCruiseDetails.cabinCode' })
  const cabinNumberValue = useWatch({ control, name: 'customCruiseDetails.cabinNumber' })
  const cabinDeckValue = useWatch({ control, name: 'customCruiseDetails.cabinDeck' })
  const cabinLocationValue = useWatch({ control, name: 'customCruiseDetails.cabinLocation' })
  const cabinImageUrlValue = useWatch({ control, name: 'customCruiseDetails.cabinImageUrl' })
  const cabinDescriptionValue = useWatch({ control, name: 'customCruiseDetails.cabinDescription' })
  const specialRequestsValue = useWatch({ control, name: 'customCruiseDetails.specialRequests' })
  // Booking details
  const bookingNumberValue = useWatch({ control, name: 'customCruiseDetails.bookingNumber' })
  const fareCodeValue = useWatch({ control, name: 'customCruiseDetails.fareCode' })
  const bookingDeadlineValue = useWatch({ control, name: 'customCruiseDetails.bookingDeadline' })

  // Phase B: New cruise fields
  const stateroomCategoryCodeValue = useWatch({ control, name: 'customCruiseDetails.stateroomCategoryCode' })
  const reservationNumberValue = useWatch({ control, name: 'customCruiseDetails.reservationNumber' })
  const onboardCreditCentsValue = useWatch({ control, name: 'customCruiseDetails.onboardCreditCents' })
  const onboardCreditCurrencyValue = useWatch({ control, name: 'customCruiseDetails.onboardCreditCurrency' })
  const netPriceCentsValue = useWatch({ control, name: 'netPriceCents' })
  const nonRefundableDepositValue = useWatch({ control, name: 'nonRefundableDeposit' })
  const cancellationScheduleValue = useWatch({ control, name: 'cancellationScheduleJson' })

  // Track if dayDate has been auto-applied (prevents duplicate application)
  const dayDateAppliedRef = useRef(false)

  // Reset the ref when dayId changes (handles navigation between different days)
  useEffect(() => {
    dayDateAppliedRef.current = false
  }, [dayId])

  // Auto-populate departure date from day context (only for new activities)
  // Uses watched departureDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditMode) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!departureDateValue) {
      dayDateAppliedRef.current = true
      setValue('customCruiseDetails.departureDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditMode, departureDateValue, setValue])

  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    // Skip auto-compute in edit mode - preserve existing day association
    if (isEditMode) {
      setDepartureDateMismatch(false)
      return
    }

    // Skip if dayId was explicitly provided via prop
    if (dayId) {
      setDepartureDateMismatch(false)
      return
    }

    // If no departure date set yet, no mismatch to report
    if (!watchedDepartureDate) {
      setDepartureDateMismatch(false)
      return
    }

    // If days array is empty, we can't compute - show mismatch warning
    if (!days || days.length === 0) {
      setDepartureDateMismatch(true)
      return
    }

    const matchingDayId = findDayByDate(watchedDepartureDate)

    if (matchingDayId) {
      // Found a matching day
      setDepartureDateMismatch(false)
      if (matchingDayId !== computedDayId) {
        setComputedDayId(matchingDayId)
        // Defer setValue to avoid setState-during-render with Controllers
        queueMicrotask(() => {
          if (!cancelled) {
            setValue('itineraryDayId', matchingDayId, { shouldDirty: false })
          }
        })
      }
    } else {
      // No matching day for this departure date
      setDepartureDateMismatch(true)
      // Clear the computed dayId since there's no match
      if (computedDayId) {
        setComputedDayId('')
        queueMicrotask(() => {
          if (!cancelled) {
            setValue('itineraryDayId', '', { shouldDirty: false })
          }
        })
      }
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [watchedDepartureDate, days, dayId, isEditMode, findDayByDate, computedDayId, setValue])

  // Autosave removed in #306 — see useUnsavedChangesWarning below.
  useUnsavedChangesWarning(isDirty)

  // Force save handler
  const forceSave = useCallback(async () => {
    const formData = getValues()

    // Special check for missing dayId with helpful message
    if (!formData.itineraryDayId) {
      const hasNoDays = days.length === 0
      const tripDatesMissing = !trip?.startDate || !trip?.endDate
      let description: string

      if (tripDatesMissing) {
        description = 'Please set trip start and end dates first, then generate itinerary days.'
      } else if (hasNoDays) {
        description = 'Please generate itinerary days first, then set a departure date that matches a day.'
      } else {
        description = 'Please set a departure date that matches an itinerary day, or generate more days.'
      }

      toast({
        title: 'Cannot Save',
        description,
        variant: 'destructive',
      })
      // Scroll to departure date field
      const departureDateEl = document.querySelector(
        '[data-field="customCruiseDetails.departureDate"]'
      ) as HTMLElement | null
      if (departureDateEl) {
        departureDateEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    // Validate before saving (same schema used by autosave)
    const { isValid, firstError } = validateFormData(formData)
    if (!isValid) {
      // Show single toast with first error only
      const fieldLabel = firstError ? formatFieldLabel(firstError.field) : 'Unknown field'
      toast({
        title: 'Validation Error',
        description: firstError
          ? `${fieldLabel}: ${firstError.message}`
          : 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      // Scroll to and focus the first error field
      if (firstError) {
        const el = document.querySelector(
          `[data-field="${firstError.field}"], [name="${firstError.field}"]`
        ) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => el.focus?.(), 300)
        }
      }
      return
    }

    const basePayload = toCustomCruiseApiPayload(formData)
    const payload = { ...basePayload, pricingBreakdownJson: pricingBreakdown, bookingDate: activityBookingDate || null }

    try {
      if (activityId) {
        // Update existing - send full payload (not just customCruiseDetails)
        await updateCustomCruise.mutateAsync({
          id: activityId,
          data: payload as any,
        })
      } else {
        const response = await createCustomCruise.mutateAsync(payload as any)
        if (response.id) {
          setActivityId(response.id)
        }
      }

      // Reset RHF dirty state so the "Unsaved changes" badge clears
      reset(formData, { keepDirty: false })

      // Show success overlay and redirect
      setShowSuccess(true)
    } catch (err) {
      const apiError = err as any
      if (apiError?.response?.data?.errors) {
        const fieldErrors: ServerFieldError[] = Object.entries(apiError.response.data.errors).flatMap(
          ([field, messages]) => (messages as string[]).map((message) => ({ field, message }))
        )
        mapServerErrors(fieldErrors, setError, CUSTOM_CRUISE_FORM_FIELDS)
        scrollToFirstError(errors)
      }

      toast({
        title: 'Save failed',
        description: apiError?.message || 'Please try again.',
        variant: 'destructive',
      })
    }
  }, [
    activityId,
    getValues,
    reset,
    toast,
    createCustomCruise,
    updateCustomCruise,
    validateFormData,
    errors,
    days,
    setError,
    trip?.startDate,
    trip?.endDate,
    pricingBreakdown,
  ])

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing cruise information...',
    })
    setAiInput('')
  }

  const handleFormSubmit = async (e: React.MouseEvent) => {
    e.preventDefault()
    await forceSave()
  }

  // Save and generate port schedule in one step
  const handleSaveAndGeneratePorts = async (e: React.MouseEvent) => {
    e.preventDefault()
    const formData = getValues()

    // Validate before saving
    const { isValid, firstError } = validateFormData(formData)
    if (!isValid) {
      const fieldLabel = firstError ? formatFieldLabel(firstError.field) : 'Unknown field'
      toast({
        title: 'Validation Error',
        description: firstError
          ? `${fieldLabel}: ${firstError.message}`
          : 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      if (firstError) {
        const el = document.querySelector(
          `[data-field="${firstError.field}"], [name="${firstError.field}"]`
        ) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => el.focus?.(), 300)
        }
      }
      return
    }

    const payload = toCustomCruiseApiPayload(formData)

    try {
      let savedId = activityId

      if (activityId) {
        await updateCustomCruise.mutateAsync({
          id: activityId,
          data: payload as any,
        })
      } else {
        const response = await createCustomCruise.mutateAsync(payload)
        if (response.id) {
          savedId = response.id
          setActivityId(response.id)
        }
      }

      // Reset RHF dirty state so the "Unsaved changes" badge clears
      reset(formData, { keepDirty: false })

      // Now generate port schedule
      if (savedId) {
        generatePortSchedule.mutate(savedId)
      }
    } catch (err) {
      const apiError = err as any
      toast({
        title: 'Save failed',
        description: apiError?.message || 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Get travelers from trip data
  const travelers = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  // Use changeCounter to refresh values after changes; no render-time subscription
  const currentValues = useMemo(() => {
    void changeCounter
    return getValues() as CustomCruiseFormData
  }, [changeCounter, getValues])

  // Build pricingData for BookingDetailsSection (uses changeCounter to refresh)
  const pricingData: PricingData = useMemo(() => {
    void changeCounter
    const values = getValues()
    return {
      // Derive invoiceType from package linkage
      invoiceType: selectedPackageId ? 'part_of_package' : 'individual_item',
      pricingType: (values.pricingType || 'per_person') as PricingData['pricingType'],
      totalPriceCents: values.totalPriceCents || 0,
      taxesAndFeesCents: values.taxesAndFeesCents || 0,
      currency: values.currency || 'USD',
      confirmationNumber: values.confirmationNumber || '',
      commissionTotalCents: values.commissionTotalCents || 0,
      commissionSplitPercentage: values.commissionSplitPercentage || 0,
      commissionExpectedDate: values.commissionExpectedDate || null,
      termsAndConditions: values.termsAndConditions || '',
      cancellationPolicy: values.cancellationPolicy || '',
      supplier: values.supplier || '',
      pricingBreakdown,
    }
  }, [changeCounter, getValues, selectedPackageId, pricingBreakdown])

  // Handler for pricing/booking/commission section updates
  const handlePricingUpdate = useCallback((updates: Partial<PricingData>) => {
    if ('pricingBreakdown' in updates) {
      setPricingBreakdown(updates.pricingBreakdown ?? null)
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'pricingBreakdown') return
      setValue(key as keyof CustomCruiseFormData, value as any, { shouldDirty: true, shouldValidate: true })
    })
  }, [setValue])

  // Handler for when supplier defaults are applied from SupplierCombobox
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditMode ? 'Cruise Updated!' : 'Cruise Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Cruise Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-cyan-500 rounded-lg flex items-center justify-center">
          <Ship className="h-8 w-8 text-white" />
        </div>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl font-semibold mb-3 ${displayName ? 'text-gray-900' : 'text-gray-400'}`}>
            {displayName || placeholder}
          </h1>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Travelers */}
            <div className="flex items-center gap-2" data-field="travelers">
              <span className="text-sm text-gray-600">Travelers ({travelers.length} of {totalTravelers})</span>
              <div className="flex -space-x-2">
                {travelers.map((traveler: any) => (
                  <Avatar key={traveler.id} className="w-8 h-8 border-2 border-white">
                    <AvatarFallback className="bg-cyan-500 text-white text-xs">
                      {traveler.initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setShowTravelersDialog(true)}
              >
                Edit
              </Button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status</span>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('proposalStatus', v as CustomCruiseFormData['proposalStatus'], { shouldDirty: true })}
              >
                <SelectTrigger className="w-32 h-8" data-field="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Unsaved-changes indicator — replaces the autosave status block (#306) */}
        <div className="flex items-center gap-2 text-sm">
          {isDirty ? (
            <>
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-amber-700">Unsaved changes</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-gray-500">All changes saved</span>
            </>
          )}
        </div>

        {/* Booking Button */}
        <BookingHeaderButton
          activityId={activityId}
          activityName={displayName || 'Cruise'}
          activityType="custom_cruise"
          isBooked={activityIsBooked}
          bookingDate={activityBookingDate}
          isChildOfPackage={isChildOfPackage}
          parentPackageId={parentPackageId}
          parentPackageName={parentPackageName}
          tripId={trip?.id || ''}
          onNavigateToTab={(tab) => { if (tab) setActiveTab(tab) }}
          onBooked={(_cascadedCount, confirmedDate) => {
            setActivityIsBooked(true)
            setActivityBookingDate(confirmedDate ? confirmedDate : new Date().toISOString().split('T')[0]!)
            queryClient.invalidateQueries({ queryKey: ['activities'] })
            queryClient.invalidateQueries({ queryKey: ['bookings'] })
            queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
          }}
          onUnbooked={() => {
            setActivityIsBooked(false)
            setActivityBookingDate(null)
            queryClient.invalidateQueries({ queryKey: ['activities'] })
            queryClient.invalidateQueries({ queryKey: ['bookings'] })
            queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
          }}
        />
      </div>

      {/* Tabbed Interface - 5 tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Ship className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="cabin" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Cabin
          </TabsTrigger>
          <TabsTrigger value="media" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Media
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="pricing" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Booking & Pricing
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-2">
            Comments
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-6 space-y-6">
          {/* AI Assist Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setIsAiAssistOpen(!isAiAssistOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-500" />
                <span className="font-medium">AI Assist</span>
              </div>
              {isAiAssistOpen ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {isAiAssistOpen && (
              <div className="p-4 border-t border-gray-200 space-y-3">
                <p className="text-sm text-gray-600">
                  Paste cruise itinerary details, booking confirmations, or voyage information, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste cruise booking details, itinerary information, or voyage descriptions..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAiSubmit} className="bg-cyan-600 hover:bg-cyan-700">
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cruise Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="cruise-name" className="text-sm font-medium text-gray-700">Cruise Name</label>
                <Input
                  {...register('name')}
                  id="cruise-name"
                  data-field="name"
                  placeholder="e.g., Caribbean 7-Night Adventure"
                  className={errors.name ? 'border-red-500 focus:ring-red-500' : ''}
                  aria-invalid={errors.name ? 'true' : 'false'}
                  aria-describedby={errors.name ? 'cruise-name-error' : undefined}
                />
                {errors.name && (
                  <p id="cruise-name-error" className="text-sm text-red-500 mt-1" role="alert">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  {...register('description')}
                  data-field="description"
                  placeholder="Brief description of this cruise..."
                  className="min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cruise Line & Ship */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cruise Line & Ship</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cruise Line</label>
                {cruiseLineOptions ? (
                  <Combobox
                    options={cruiseLineOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                    value={cruiseLineNameValue || null}
                    onValueChange={(value) => {
                      const selected = cruiseLineOptions.find(opt => opt.label === value || opt.value === value)
                      if (selected) {
                        setValue('customCruiseDetails.cruiseLineName', selected.label, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseLineCode', selected.data?.name?.substring(0, 3).toUpperCase() || null, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseLineId', selected.value, { shouldDirty: true })
                        setValue('customCruiseDetails.shipName', null, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseShipId', null, { shouldDirty: true })
                        setSelectedCruiseLineId(selected.value)
                      } else if (value) {
                        setValue('customCruiseDetails.cruiseLineName', value, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseLineId', null, { shouldDirty: true })
                        setValue('customCruiseDetails.shipName', null, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseShipId', null, { shouldDirty: true })
                        setSelectedCruiseLineId(undefined)
                      } else {
                        setValue('customCruiseDetails.cruiseLineName', null, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseLineId', null, { shouldDirty: true })
                        setValue('customCruiseDetails.shipName', null, { shouldDirty: true })
                        setValue('customCruiseDetails.cruiseShipId', null, { shouldDirty: true })
                        setSelectedCruiseLineId(undefined)
                      }
                    }}
                    placeholder="Select cruise line..."
                    searchPlaceholder="Search cruise lines..."
                    allowCustom
                  />
                ) : (
                  <Input
                    value={cruiseLineNameValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cruiseLineName', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cruiseLineName"
                    placeholder="e.g., Royal Caribbean"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Ship Name</label>
                  {cruiseShipOptions ? (
                    <Combobox
                      options={cruiseShipOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                      value={shipNameValue || null}
                      onValueChange={(value) => {
                        const selected = cruiseShipOptions.find(opt => opt.label === value || opt.value === value)
                        if (selected) {
                          setValue('customCruiseDetails.shipName', selected.label, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseShipId', selected.value, { shouldDirty: true })
                        } else if (value) {
                          setValue('customCruiseDetails.shipName', value, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseShipId', null, { shouldDirty: true })
                        } else {
                          setValue('customCruiseDetails.shipName', null, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseShipId', null, { shouldDirty: true })
                        }
                      }}
                      placeholder="Select ship..."
                      searchPlaceholder="Search ships..."
                      allowCustom
                    />
                  ) : (
                    <Input
                      value={shipNameValue || ''}
                      onChange={(e) => setValue('customCruiseDetails.shipName', e.target.value || null, { shouldDirty: true })}
                      data-field="customCruiseDetails.shipName"
                      placeholder="e.g., Symphony of the Seas"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Ship Image URL (optional)</label>
                  <Input
                    value={shipImageUrlValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.shipImageUrl', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.shipImageUrl"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Voyage Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Voyage Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Itinerary Name</label>
                  <Input
                    value={itineraryNameValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.itineraryName', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.itineraryName"
                    placeholder="e.g., Western Caribbean 7-Night"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Voyage Code</label>
                  <Input
                    value={voyageCodeValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.voyageCode', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.voyageCode"
                    placeholder="e.g., WC20260301"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Region</label>
                  {cruiseRegionOptions ? (
                    <Combobox
                      options={cruiseRegionOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                      value={regionValue || null}
                      onValueChange={(value) => {
                        const selected = cruiseRegionOptions.find(opt => opt.label === value || opt.value === value)
                        if (selected) {
                          setValue('customCruiseDetails.region', selected.label, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseRegionId', selected.value, { shouldDirty: true })
                        } else if (value) {
                          setValue('customCruiseDetails.region', value, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseRegionId', null, { shouldDirty: true })
                        } else {
                          setValue('customCruiseDetails.region', null, { shouldDirty: true })
                          setValue('customCruiseDetails.cruiseRegionId', null, { shouldDirty: true })
                        }
                      }}
                      placeholder="Select region..."
                      searchPlaceholder="Search regions..."
                      allowCustom
                    />
                  ) : (
                    <Input
                      value={regionValue || ''}
                      onChange={(e) => setValue('customCruiseDetails.region', e.target.value || null, { shouldDirty: true })}
                      data-field="customCruiseDetails.region"
                      placeholder="e.g., Caribbean"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Nights</label>
                  <Input
                    type="number"
                    min="0"
                    value={nightsValue ?? ''}
                    onChange={(e) => setValue('customCruiseDetails.nights', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    data-field="customCruiseDetails.nights"
                    placeholder="e.g., 7"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Sea Days</label>
                  <Input
                    type="number"
                    min="0"
                    value={seaDaysValue ?? ''}
                    onChange={(e) => setValue('customCruiseDetails.seaDays', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    data-field="customCruiseDetails.seaDays"
                    placeholder="e.g., 3"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Departure & Arrival */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Departure & Arrival</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Departure */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Departure</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Port</label>
                    <Combobox
                      options={cruisePortOptions?.map(opt => ({ value: opt.value, label: opt.label })) || []}
                      value={departurePortValue || null}
                      onValueChange={(value) => {
                        const selected = cruisePortOptions?.find(opt => opt.label === value || opt.value === value)
                        if (selected) {
                          setValue('customCruiseDetails.departurePort', selected.label, { shouldDirty: true })
                          setValue('customCruiseDetails.departurePortId', selected.value, { shouldDirty: true })
                        } else if (value) {
                          setValue('customCruiseDetails.departurePort', value, { shouldDirty: true })
                          setValue('customCruiseDetails.departurePortId', null, { shouldDirty: true })
                        } else {
                          setValue('customCruiseDetails.departurePort', null, { shouldDirty: true })
                          setValue('customCruiseDetails.departurePortId', null, { shouldDirty: true })
                        }
                      }}
                      placeholder="Select or enter port..."
                      searchPlaceholder="Search ports..."
                      allowCustom
                    />
                  </div>

                  <div className="space-y-2" data-field="startDatetime">
                    <label className="text-sm font-medium text-gray-700">Date</label>
                    <DatePickerEnhanced
                      value={departureDateValue || undefined}
                      onChange={(date) => setValue('customCruiseDetails.departureDate', date ?? null, { shouldDirty: true })}
                      placeholder="Select date"
                      defaultMonthHint={tripMonthHint}
                    />
                    <TripDateWarning
                      date={departureDateValue}
                      tripStartDate={trip?.startDate}
                      tripEndDate={trip?.endDate}
                      fieldLabel="Departure date"
                    />
                    {/* Warning when departure date doesn't match any itinerary day */}
                    {!isEditMode && departureDateMismatch && departureDateValue && (
                      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded-md mt-1">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">No matching day:</span>{' '}
                          {!trip?.startDate || !trip?.endDate
                            ? 'Set trip dates first, then generate itinerary days.'
                            : days.length === 0
                              ? 'Generate itinerary days first to auto-assign this cruise.'
                              : 'This date doesn\'t match any itinerary day. Generate more days or adjust the date.'}
                        </div>
                      </div>
                    )}
                    {/* Day assignment feedback for pendingDay mode */}
                    {pendingDay && departureDateValue && matchedDay && !departureDateMismatch && (
                      <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5 mt-1">
                        <Check className="h-4 w-4" />
                        This cruise will be added to <strong>Day {matchedDay.dayNumber}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Time</label>
                    <TimePicker
                      value={departureTimeValue || undefined}
                      onChange={(time) => setValue('customCruiseDetails.departureTime', time ?? '', { shouldDirty: true })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Timezone</label>
                    <Input
                      value={departureTimezoneValue || ''}
                      onChange={(e) => setValue('customCruiseDetails.departureTimezone', e.target.value || null, { shouldDirty: true })}
                      data-field="customCruiseDetails.departureTimezone"
                      placeholder="e.g., America/New_York"
                    />
                  </div>
                </div>
              </div>

              {/* Arrival */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Arrival</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Port</label>
                    <Combobox
                      options={cruisePortOptions?.map(opt => ({ value: opt.value, label: opt.label })) || []}
                      value={arrivalPortValue || null}
                      onValueChange={(value) => {
                        const selected = cruisePortOptions?.find(opt => opt.label === value || opt.value === value)
                        if (selected) {
                          setValue('customCruiseDetails.arrivalPort', selected.label, { shouldDirty: true })
                          setValue('customCruiseDetails.arrivalPortId', selected.value, { shouldDirty: true })
                        } else if (value) {
                          setValue('customCruiseDetails.arrivalPort', value, { shouldDirty: true })
                          setValue('customCruiseDetails.arrivalPortId', null, { shouldDirty: true })
                        } else {
                          setValue('customCruiseDetails.arrivalPort', null, { shouldDirty: true })
                          setValue('customCruiseDetails.arrivalPortId', null, { shouldDirty: true })
                        }
                      }}
                      placeholder="Select or enter port..."
                      searchPlaceholder="Search ports..."
                      allowCustom
                    />
                  </div>

                  <div className="space-y-2" data-field="endDatetime">
                    <label className="text-sm font-medium text-gray-700">Date</label>
                    <DatePickerEnhanced
                      value={arrivalDateValue || undefined}
                      onChange={(date) => setValue('customCruiseDetails.arrivalDate', date ?? null, { shouldDirty: true })}
                      placeholder="Select date"
                      defaultMonthHint={tripMonthHint}
                    />
                    <TripDateWarning
                      date={arrivalDateValue}
                      tripStartDate={trip?.startDate}
                      tripEndDate={trip?.endDate}
                      fieldLabel="Arrival date"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Time</label>
                    <TimePicker
                      value={arrivalTimeValue || undefined}
                      onChange={(time) => setValue('customCruiseDetails.arrivalTime', time ?? '', { shouldDirty: true })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Timezone</label>
                    <Input
                      value={arrivalTimezoneValue || ''}
                      onChange={(e) => setValue('customCruiseDetails.arrivalTimezone', e.target.value || null, { shouldDirty: true })}
                      data-field="customCruiseDetails.arrivalTimezone"
                      placeholder="e.g., America/New_York"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Port Schedule Generation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Anchor className="h-5 w-5" />
                Port Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Optionally generate port schedule entries for each day of the cruise based on the departure and arrival dates.
              </p>

              {/* Show existing port schedule count */}
              {portSchedule && portSchedule.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{portSchedule.length} port entries already generated</span>
                </div>
              )}

              {/* Step-by-step guidance for new cruises */}
              {!activityId && (
                <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm font-medium text-blue-800">To generate port schedule:</p>
                  <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                    <li className={currentValues.customCruiseDetails?.departureDate ? 'text-blue-500 line-through' : ''}>
                      Set departure date above
                    </li>
                    <li className={currentValues.customCruiseDetails?.arrivalDate ? 'text-blue-500 line-through' : ''}>
                      Set arrival date above
                    </li>
                    <li>Click &quot;Save Cruise&quot; at the bottom of the form</li>
                    <li>Return here to generate port schedule</li>
                  </ol>
                </div>
              )}

              {/* Generation requirements for saved cruises */}
              {activityId && (!currentValues.customCruiseDetails?.departureDate || !currentValues.customCruiseDetails?.arrivalDate) && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span>Set both departure and arrival dates above to generate port schedule</span>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={
                  !activityId ||
                  !currentValues.customCruiseDetails?.departureDate ||
                  !currentValues.customCruiseDetails?.arrivalDate ||
                  generatePortSchedule.isPending
                }
                onClick={() => {
                  if (activityId) {
                    generatePortSchedule.mutate(activityId)
                  }
                }}
              >
                {generatePortSchedule.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Port Schedule...
                  </>
                ) : portSchedule && portSchedule.length > 0 ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate Port Schedule
                  </>
                ) : (
                  <>
                    <Anchor className="h-4 w-4 mr-2" />
                    Generate Port Schedule
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500">
                This will create departure, sea day, and arrival entries linked to this cruise. Regenerating will replace existing entries.
              </p>
            </CardContent>
          </Card>

          {/* Traveltek Identity */}
          {currentValues.customCruiseDetails?.source === 'traveltek' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Traveltek Identity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Traveltek Cruise ID</label>
                  <Input
                    value={traveltekCruiseIdValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.traveltekCruiseId', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.traveltekCruiseId"
                    placeholder="Traveltek system ID"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cabin Tab */}
        <TabsContent value="cabin" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cabin Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cabin Category</label>
                  <Input
                    value={cabinCategoryValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinCategory', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinCategory"
                    placeholder="e.g., Suite, Balcony, Oceanview, Inside"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cabin Code</label>
                  <Input
                    value={cabinCodeValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinCode', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinCode"
                    placeholder="e.g., 1A"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cabin Number</label>
                  <Input
                    value={cabinNumberValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinNumber', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinNumber"
                    placeholder="e.g., 7234"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cabin Deck</label>
                  <Input
                    value={cabinDeckValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinDeck', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinDeck"
                    placeholder="e.g., Deck 7"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cabin Location</label>
                  <Input
                    value={cabinLocationValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinLocation', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinLocation"
                    placeholder="e.g., Mid-Ship, Aft"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Stateroom Category</label>
                  <Input
                    value={stateroomCategoryCodeValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.stateroomCategoryCode', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.stateroomCategoryCode"
                    placeholder="e.g., D4, JS"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cabin Image</label>
                <div className="flex gap-2">
                  <Input
                    value={cabinImageUrlValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.cabinImageUrl', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.cabinImageUrl"
                    placeholder="https://... (link to cabin photo)"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={isUploadingCabinImage}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/jpeg,image/png,image/gif,image/webp'
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file && activityId) {
                          setIsUploadingCabinImage(true)
                          try {
                            const formData = new FormData()
                            formData.append('file', file)
                            formData.append('documentType', 'cabin_image')
                            const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
                            const response = await fetch(`${apiUrl}/components/${activityId}/documents`, {
                              method: 'POST',
                              body: formData,
                            })
                            if (response.ok) {
                              const doc = await response.json()
                              // Fetch the document again to get the signed download URL
                              const docResponse = await fetch(`${apiUrl}/components/${activityId}/documents/${doc.id}`)
                              if (docResponse.ok) {
                                const docWithUrl = await docResponse.json()
                                setValue('customCruiseDetails.cabinImageUrl', docWithUrl.downloadUrl)
                                toast({ title: 'Cabin image uploaded successfully' })
                              } else {
                                // Fallback to fileUrl if fetch fails
                                setValue('customCruiseDetails.cabinImageUrl', doc.fileUrl)
                                toast({ title: 'Cabin image uploaded successfully' })
                              }
                            } else {
                              const errorText = await response.text()
                              console.error('Upload failed:', response.status, errorText)
                              // Parse error message from API response
                              let errorMessage = 'Failed to upload image'
                              try {
                                const errorJson = JSON.parse(errorText)
                                errorMessage = errorJson.message || errorMessage
                              } catch {
                                // Use default error message
                              }
                              throw new Error(errorMessage)
                            }
                          } catch (err) {
                            console.error('Upload error:', err)
                            const message = err instanceof Error ? err.message : 'Failed to upload image'
                            toast({
                              title: 'Upload Failed',
                              description: message,
                              variant: 'destructive'
                            })
                          } finally {
                            setIsUploadingCabinImage(false)
                          }
                        } else if (!activityId) {
                          toast({ title: 'Save cruise first', description: 'Please save the cruise details before uploading images.', variant: 'destructive' })
                        }
                      }
                      input.click()
                    }}
                  >
                    {isUploadingCabinImage ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4 mr-1" />
                    )}
                    {isUploadingCabinImage ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">Enter a URL or upload an image of the cabin</p>
                {currentValues.customCruiseDetails?.cabinImageUrl && (
                  <div className="mt-2">
                    <img
                      src={currentValues.customCruiseDetails.cabinImageUrl}
                      alt="Cabin preview"
                      className="max-w-xs max-h-32 rounded border object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cabin Description (optional)</label>
                <Textarea
                  value={cabinDescriptionValue || ''}
                  onChange={(e) => setValue('customCruiseDetails.cabinDescription', e.target.value || null, { shouldDirty: true })}
                  data-field="customCruiseDetails.cabinDescription"
                  placeholder="Describe the cabin features, amenities, view, etc."
                  className="min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Special Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Special Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Textarea
                  value={specialRequestsValue || ''}
                  onChange={(e) => setValue('customCruiseDetails.specialRequests', e.target.value || null, { shouldDirty: true })}
                  data-field="customCruiseDetails.specialRequests"
                  placeholder="e.g., Wheelchair accessible, adjoining cabins, anniversary celebration, dietary requirements..."
                  className="min-h-[100px]"
                />
                <p className="text-xs text-gray-500">Any special requests or notes for this cruise booking</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="cruise"
              itineraryId={itineraryId}
              title="Cruise Photos"
              description="Ship photos, cabin images, and cruise experience"
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Save the cruise first to upload media.</p>
                  <p className="text-sm mt-1">Media will be available after the cruise is created.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <div className="space-y-6">
              <DocumentUploader componentId={activityId} />
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Common Cruise Documents</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>Booking confirmations & e-tickets</li>
                  <li>Cruise insurance documents</li>
                  <li>Luggage tags & deck plans</li>
                  <li>Shore excursion vouchers</li>
                  <li>Travel visas & passport copies</li>
                </ul>
                <p className="text-xs text-blue-600 mt-3">
                  Supported: PDF, images, Word, Excel (max 10MB)
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Save the cruise first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the cruise is created.</p>
            </div>
          )}
        </TabsContent>

        {/* Booking & Pricing Tab */}
        <TabsContent value="pricing" className="mt-6 space-y-6">
          {/* Cruise-specific booking info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cruise Booking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Booking Number</label>
                  <Input
                    value={bookingNumberValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.bookingNumber', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.bookingNumber"
                    placeholder="Cruise booking reference"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Fare Code</label>
                  <Input
                    value={fareCodeValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.fareCode', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.fareCode"
                    placeholder="e.g., PROMO2024"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Booking Deadline</label>
                  <DatePickerEnhanced
                    value={bookingDeadlineValue || undefined}
                    onChange={(date) => setValue('customCruiseDetails.bookingDeadline', date ?? null, { shouldDirty: true })}
                    placeholder="Select deadline"
                    defaultMonthHint={tripMonthHint}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Reservation Number</label>
                  <Input
                    value={reservationNumberValue || ''}
                    onChange={(e) => setValue('customCruiseDetails.reservationNumber', e.target.value || null, { shouldDirty: true })}
                    data-field="customCruiseDetails.reservationNumber"
                    placeholder="Cruise line confirmation #"
                  />
                  <p className="text-xs text-gray-500">Cruise line confirmation number (different from Tailfire booking number)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Onboard Credit</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={onboardCreditCentsValue != null ? centsToDollars(onboardCreditCentsValue) : ''}
                    onChange={(e) => {
                      const cents = e.target.value ? dollarsToCents(e.target.value) : null
                      setValue('customCruiseDetails.onboardCreditCents', cents, { shouldDirty: true })
                    }}
                    data-field="customCruiseDetails.onboardCreditCents"
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">OBC Currency</label>
                  <Select
                    value={onboardCreditCurrencyValue || ''}
                    onValueChange={(value) => setValue('customCruiseDetails.onboardCreditCurrency', value || null, { shouldDirty: true })}
                  >
                    <SelectTrigger data-field="customCruiseDetails.onboardCreditCurrency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import Metadata — only shown when populated (from booking import) */}
          {(currentValues.customCruiseDetails?.diningPreferences &&
            Object.keys(currentValues.customCruiseDetails.diningPreferences).length > 0) ||
           (currentValues.customCruiseDetails?.selectedExtras &&
            currentValues.customCruiseDetails.selectedExtras.length > 0) ||
           (currentValues.customCruiseDetails?.selectedPromotions &&
            Object.keys(currentValues.customCruiseDetails.selectedPromotions).length > 0) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Import Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentValues.customCruiseDetails?.diningPreferences &&
                  Object.keys(currentValues.customCruiseDetails.diningPreferences).length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Dining Preferences</label>
                    <div className="rounded-md border bg-gray-50 p-3">
                      {(() => {
                        const dp = currentValues.customCruiseDetails.diningPreferences as Record<string, unknown>
                        const seatings = dp.seatings as Array<Record<string, string>> | undefined
                        if (seatings && Array.isArray(seatings)) {
                          return (
                            <div className="space-y-1 text-sm text-gray-700">
                              {seatings.map((s, i) => (
                                <p key={i}>{s.description || s.seating}{s.tablesize ? ` (Table: ${s.tablesize})` : ''}</p>
                              ))}
                              {dp.smoking ? <p>Smoking: {String(dp.smoking)}</p> : null}
                            </div>
                          )
                        }
                        return <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(dp, null, 2)}</pre>
                      })()}
                    </div>
                  </div>
                )}

                {currentValues.customCruiseDetails?.selectedExtras &&
                  currentValues.customCruiseDetails.selectedExtras.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Selected Extras</label>
                    <div className="rounded-md border bg-gray-50 p-3">
                      <div className="space-y-1 text-sm text-gray-700">
                        {currentValues.customCruiseDetails.selectedExtras.map((extra, i) => (
                          <p key={i}>
                            {(extra as Record<string, unknown>).description
                              ? String((extra as Record<string, unknown>).description)
                              : JSON.stringify(extra)}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentValues.customCruiseDetails?.selectedPromotions &&
                  Object.keys(currentValues.customCruiseDetails.selectedPromotions).length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Applied Promotions</label>
                    <div className="rounded-md border bg-gray-50 p-3">
                      <div className="space-y-1 text-sm text-gray-700">
                        {Object.entries(currentValues.customCruiseDetails.selectedPromotions as Record<string, unknown>).map(([key, val]) => (
                          <p key={key}>{key}: {String(val)}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Separator />

          {/* Pricing Section */}
          <PricingSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={{}}
            packageId={selectedPackageId}
            packages={availablePackages}
            tripId={trip?.id}
            onPackageChange={setSelectedPackageId}
            isChildOfPackage={isChildOfPackage}
            parentPackageName={parentPackageName}
            travelers={travelers}
          />

          <Separator />

          {/* Passenger Loyalty Programs */}
          <CruisePassengersSection
            activityId={activityId}
            tripId={trip?.id || ''}
          />

          <Separator />

          {/* Payment Schedule */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Credit Card Authorization & Payment</h3>
            <PaymentScheduleSection
              activityPricingId={activityPricingId}
              totalPriceCents={pricingData.totalPriceCents}
              currency={pricingData.currency}
              tripId={trip?.id || ''}
            />
          </div>

          {/* Cancellation Schedule */}
          {(cancellationScheduleValue && cancellationScheduleValue.length > 0) ? (
            <>
              <Separator />
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Cancellation Schedule</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const current = cancellationScheduleValue || []
                      setValue('cancellationScheduleJson', [
                        ...current,
                        { daysRange: '', penaltyPercent: 0, penaltyAmountCents: null, effectiveDate: null, description: null },
                      ], { shouldDirty: true })
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Row
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium text-gray-700">Days Range</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-700">Penalty %</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-700">Amount</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-700">Effective Date</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-700">Description</th>
                          <th className="py-2 px-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancellationScheduleValue.map((row: any, index: number) => {
                          const updateRow = (field: string, value: unknown) => {
                            const updated = (cancellationScheduleValue as any[]).map((r: any, i: number) =>
                              i === index ? { ...r, [field]: value } : r
                            )
                            setValue('cancellationScheduleJson', updated as any, { shouldDirty: true })
                          }
                          return (
                          <tr key={index} className="border-b">
                            <td className="py-2 px-2">
                              <Input
                                value={row.daysRange || ''}
                                onChange={(e) => updateRow('daysRange', e.target.value)}
                                placeholder="e.g., 90-120"
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={row.penaltyPercent ?? ''}
                                onChange={(e) => updateRow('penaltyPercent', e.target.value ? Number(e.target.value) : 0)}
                                placeholder="0"
                                className="h-8 w-20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={row.penaltyAmountCents ? centsToDollars(row.penaltyAmountCents) : ''}
                                onChange={(e) => updateRow('penaltyAmountCents', e.target.value ? dollarsToCents(e.target.value) : null)}
                                placeholder="0.00"
                                className="h-8 w-24"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="date"
                                value={row.effectiveDate || ''}
                                onChange={(e) => updateRow('effectiveDate', e.target.value || null)}
                                className="h-8"
                                min="1900-01-01"
                                max="2099-12-31"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                value={row.description || ''}
                                onChange={(e) => updateRow('description', e.target.value || null)}
                                placeholder="Description"
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  const updated = cancellationScheduleValue.filter((_: any, i: number) => i !== index)
                                  setValue('cancellationScheduleJson', (updated.length > 0 ? updated : null) as any, { shouldDirty: true })
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Separator />
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setValue('cancellationScheduleJson', [
                      { daysRange: '', penaltyPercent: 0, penaltyAmountCents: null, effectiveDate: null, description: null },
                    ], { shouldDirty: true })
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Cancellation Schedule
                </Button>
              </div>
            </>
          )}

          <Separator />

          {/* Agency Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agency Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Net Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={netPriceCentsValue ? centsToDollars(netPriceCentsValue) : ''}
                    onChange={(e) => {
                      const cents = e.target.value ? dollarsToCents(e.target.value) : null
                      setValue('netPriceCents', cents, { shouldDirty: true })
                    }}
                    data-field="netPriceCents"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500">Agency net cost (before markup)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Non-Refundable Deposit</label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="nonRefundableDeposit"
                      checked={nonRefundableDepositValue || false}
                      onCheckedChange={(checked) => setValue('nonRefundableDeposit', checked as boolean, { shouldDirty: true })}
                    />
                    <Label htmlFor="nonRefundableDeposit" className="text-sm text-gray-700 font-normal">
                      Deposit is non-refundable
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Booking Details */}
          <BookingDetailsSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            onSupplierDefaultsApplied={handleSupplierDefaultsApplied}
            onNavigateToTab={(tab) => setActiveTab(tab as any)}
            bookingDate={activityBookingDate}
            onBookingDateChange={setActivityBookingDate}
          />

          <Separator />

          {/* Commission Section */}
          <CommissionSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={{}}
            isChildOfPackage={isChildOfPackage}
            parentPackageName={parentPackageName}
            supplierCommissionRate={supplierCommissionRate}
            userSplitValue={userProfile?.commissionSettings?.splitValue ?? null}
            userSplitType={userProfile?.commissionSettings?.splitType ?? null}
          />

          <Separator />

        </TabsContent>

        <TabsContent value="comments" className="mt-6">
          {isEditMode && activity?.id ? (
            <ActivityCommentsPanel
              tripId={trip?.id || ''}
              itineraryId={itineraryId}
              activityId={activity.id}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Save the activity first to view comments.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handleFormSubmit} className="bg-cyan-600 hover:bg-cyan-700">
          Save Cruise
        </Button>
        {/* Show "Save & Generate Ports" option when dates are set and cruise hasn't been saved */}
        {!activityId &&
          currentValues.customCruiseDetails?.departureDate &&
          currentValues.customCruiseDetails?.arrivalDate && (
            <Button
              onClick={handleSaveAndGeneratePorts}
              className="bg-teal-600 hover:bg-teal-700"
              disabled={generatePortSchedule.isPending}
            >
              <Anchor className="h-4 w-4 mr-2" />
              Save & Generate Ports
            </Button>
          )}
      </div>

      {/* Travelers Dialog */}
      {trip && (
        <EditTravelersDialog
          open={showTravelersDialog}
          onOpenChange={setShowTravelersDialog}
          trip={trip}
        />
      )}

    </div>
  )
}
