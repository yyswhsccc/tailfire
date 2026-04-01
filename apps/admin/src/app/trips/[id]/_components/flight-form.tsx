'use client'

import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plane, ChevronDown, ChevronUp, Sparkles, Plus, MoreVertical, Loader2, Check, AlertCircle, X, Trash2, Pencil } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { useBookings } from '@/hooks/use-bookings'
import {
  useCreateFlight,
  useUpdateFlight,
  useFlight,
  useExternalFlightSearchWithRateLimit,
  useExternalFlightSearchWithProvider,
} from '@/hooks/use-flights'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { useQueryClient } from '@tanstack/react-query'
import { BookingHeaderButton } from '@/components/activities/booking-header-button'
import type { NormalizedFlightStatus, NormalizedFlightOffer } from '@tailfire/shared-types/api'
import { FlightOffersSearchPanel } from '@/components/flight-offers-search-panel'
import { normalizedTimeToFormFields } from '@/lib/flight-time-utils'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { PaymentScheduleSection } from './payment-schedule-section'
import { ComponentMediaTab } from '@/components/shared'
import { ActivityCommentsPanel } from '@/components/activities/activity-comments-panel'
import { DocumentUploader } from '@/components/document-uploader'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { buildInitialPricingState, type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { DateRangeInput } from '@/components/ui/date-range-input'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { AirlineAutocomplete } from '@/components/ui/airline-autocomplete'
import { AirportAutocomplete } from '@/components/ui/airport-autocomplete'
import { FlightSearchResultCard } from '@/components/ui/flight-search-result-card'
import {
  flightFormSchema,
  toFlightDefaults,
  toFlightApiPayload,
  createDefaultSegment,
  FLIGHT_FORM_FIELDS,
  type FlightFormData,
} from '@/lib/validation/flight-validation'
import { mapServerErrors, scrollToFirstError, getErrorMessage } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'
import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { FlightJourneyDisplay } from '@/components/ui/flight-journey-display'
import type { FlightSegmentDto } from '@tailfire/shared-types'

// UUID helper with fallback for SSR/older browsers
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Format a date string (YYYY-MM-DD) to local display without timezone shift.
 * Parses date components directly to avoid UTC conversion issues.
 */
function formatDateLocal(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Valid form proposal status values
const VALID_STATUSES = ['draft', 'proposing', 'approved', 'cancelled'] as const
type FormStatus = (typeof VALID_STATUSES)[number]

// Valid pricing type values
const VALID_PRICING_TYPES = ['per_person', 'per_group', 'fixed', 'per_room', 'total'] as const
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

// Coerce API flightDetails to form-safe structure (convert null to empty string)
function coerceFlightDetails(details: any): FlightFormData['flightDetails'] & { segments?: any[] } | undefined {
  if (!details) return undefined
  return {
    airline: details.airline ?? '',
    flightNumber: details.flightNumber ?? '',
    departureAirportCode: details.departureAirportCode ?? '',
    arrivalAirportCode: details.arrivalAirportCode ?? '',
    departureDate: details.departureDate ?? null,
    departureTime: details.departureTime ?? null,
    departureTimezone: details.departureTimezone ?? '',
    departureTerminal: details.departureTerminal ?? '',
    departureGate: details.departureGate ?? '',
    arrivalDate: details.arrivalDate ?? null,
    arrivalTime: details.arrivalTime ?? null,
    arrivalTimezone: details.arrivalTimezone ?? '',
    arrivalTerminal: details.arrivalTerminal ?? '',
    arrivalGate: details.arrivalGate ?? '',
    // Include segments for multi-segment flights - passed to toFlightDefaults for form hydration
    segments: details.segments,
  }
}

/**
 * Fallback: synthesize flight details from activity startDatetime/endDatetime
 * when the flight_details table was never populated (e.g. TES import).
 * Extracts date (YYYY-MM-DD) and time (HH:MM) from ISO datetime strings.
 */
function synthesizeFlightDetailsFromActivity(activity: any): (FlightFormData['flightDetails'] & { segments?: any[] }) | undefined {
  const start = activity?.startDatetime
  const end = activity?.endDatetime
  if (!start && !end) return undefined

  const extractDate = (iso: string) => iso.substring(0, 10)
  const extractTime = (iso: string) => iso.substring(11, 16)

  // Try to extract flight number and airports from the activity name
  // Common pattern: "Outbound Flight WS2622 YFC→CUN" or "AF328"
  const name = activity?.name || ''
  const airportMatch = name.match(/([A-Z]{3})\s*[→\-–>]+\s*([A-Z]{3})/)
  const flightMatch = name.match(/\b([A-Z]{2}\d{2,4})\b/)

  const seg = {
    airline: '',
    flightNumber: flightMatch?.[1] || '',
    departureAirportCode: airportMatch?.[1] || '',
    arrivalAirportCode: airportMatch?.[2] || '',
    departureDate: start ? extractDate(start) : null,
    departureTime: start ? extractTime(start) : null,
    departureTimezone: '',
    departureTerminal: '',
    departureGate: '',
    arrivalDate: end ? extractDate(end) : null,
    arrivalTime: end ? extractTime(end) : null,
    arrivalTimezone: '',
    arrivalTerminal: '',
    arrivalGate: '',
  }

  // Include segments array so toFlightDefaults maps to flightSegments form fields
  return { ...seg, segments: [seg] }
}

interface FlightFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  /** URL param activityId - reliable source during client-side navigation (avoids keepPreviousData stale ID) */
  activityIdFromUrl?: string
  trip?: any // TODO: proper type
  onSuccess?: () => void
  onCancel?: () => void
  /** When true, user must select a date to determine which day to assign activity to */
  pendingDay?: boolean
  /** Available itinerary days (required when pendingDay is true) */
  days?: ItineraryDayWithActivitiesDto[]
}

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const ITINERARY_DISPLAY_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'multi', label: 'Multi-City' },
  { value: 'round_trip', label: 'Round Trip' },
] as const

// Helper component for field errors
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-red-600 mt-1">{message}</p>
}

export function FlightForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  activityIdFromUrl,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: FlightFormProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const isEditing = !!activity

  // Derive effective dayDate from props or days array
  // This handles the case where dayDate prop is undefined because days hadn't loaded
  // when page.tsx rendered, but days is now available via the prop
  const effectiveDayDate = useMemo(() => {
    if (dayDate) return dayDate
    if (dayId && days.length > 0) {
      const matchingDay = days.find((d) => d.id === dayId)
      return matchingDay?.date ?? null
    }
    return null
  }, [dayDate, dayId, days])

  // UI state
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [showTravelersDialog, setShowTravelersDialog] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'booking' ? 'booking' : 'general'
  })

  const [showSuccess, setShowSuccess] = useState(false)
  const { returnToItinerary } = useActivityNavigation()
  const [activityIsBooked, setActivityIsBooked] = useState(activity?.bookingStatus === 'booked')
  const [activityBookingDate, setActivityBookingDate] = useState<string | null>(activity?.bookingDate ?? null)
  const queryClient = useQueryClient()

  // Package linkage state
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(activity?.packageId ?? null)
  const [pricingBreakdown, setPricingBreakdown] = useState<PricingBreakdownItem[] | null>(
    (activity as any)?.pricingBreakdownJson ?? null
  )
  const { data: packagesData } = useBookings({ tripId: trip?.id })
  const availablePackages = useMemo(() =>
    packagesData?.map(pkg => ({ id: pkg.id, name: pkg.name })) ?? [],
    [packagesData]
  )

  // Child of package guard - disables pricing when activity is linked to a package
  const { isChildOfPackage, parentPackageName, parentPackageId } = useIsChildOfPackage(activity)

  // Fetch user profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)

  // Activity pricing ID (gated on this for payment schedule)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // Save status tracking (with date validation)
  const { saveStatus, setSaveStatus, lastSavedAt, setLastSavedAt } = useSaveStatus({
    activityId: activity?.id,
    updatedAt: activity?.updatedAt,
  })

  // Flight search state (per-segment)
  const [searchingSegmentIndex, setSearchingSegmentIndex] = useState<number | null>(null)
  const [searchFlightNumber, setSearchFlightNumber] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)

  // Amadeus fallback search state ("More Results" button)
  const [amadeusSearchEnabled, setAmadeusSearchEnabled] = useState(false)
  const [showAmadeusResults, setShowAmadeusResults] = useState(false)

  // Track whether user has selected a flight from search results (or is editing existing)
  // Visual journey display only shows after selection, not while typing
  const [hasSelectedFlight, setHasSelectedFlight] = useState(!!activity)

  // Flight offers search (price shopping)
  const [showFlightOffers, setShowFlightOffers] = useState(false)

  // Title editing state - allows user to override auto-generated title
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Flight search hook (default provider - Aerodatabox with fallback)
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
    refetchSearch,
  } = useExternalFlightSearchWithRateLimit(searchFlightNumber, searchDate, { enabled: showSearchResults })

  // Amadeus-specific search hook ("More Results" fallback)
  const {
    data: amadeusResults,
    isLoading: isSearchingAmadeus,
    error: amadeusError,
  } = useExternalFlightSearchWithProvider(
    searchFlightNumber,
    searchDate,
    'amadeus',
    { enabled: amadeusSearchEnabled && !!searchFlightNumber && !!searchDate }
  )

  // Initialize form with RHF + Zod
  // Use activity data if editing, otherwise just dayId for new flights
  const form = useForm<FlightFormData>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: toFlightDefaults(
      activity ? { ...activity, itineraryDayId: dayId } as Parameters<typeof toFlightDefaults>[0] : { itineraryDayId: dayId },
      dayDate,
      trip?.currency
    ),
    mode: 'onSubmit', // Validate on submit to avoid render-time Controller issues
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty, isValid, isValidating, isSubmitting },
    reset,
    setError,
    getValues,
    setValue,
  } = form

  // useWatch for non-segment custom components (Selects)
  // Using individual useWatch calls to avoid Controller registration issues
  const statusValue = useWatch({ control, name: 'proposalStatus' })
  const itineraryDisplayValue = useWatch({ control, name: 'itineraryDisplay' })
  const nameValue = useWatch({ control, name: 'name' })

  // Watch flight segments for custom components within segments
  const flightSegmentsWatch = useWatch({ control, name: 'flightSegments' })

  // Auto-generate activity name from flight segments
  const { displayName: displayTitle, hasCustomTitle, resetToGenerated } = useActivityNameGenerator({
    activityType: 'flight',
    control,
    setValue,
    flightSegments: flightSegmentsWatch?.map(seg => ({
      airline: seg.airline,
      flightNumber: seg.flightNumber,
      departureAirport: seg.departureAirport,
      arrivalAirport: seg.arrivalAirport,
    })),
  })

  // Derive dayId from first segment's date (for pendingDay mode)
  // Use 'date' field (manual entry) first, fall back to 'departureDate' (flight search API)
  const primaryDepartureDate = flightSegmentsWatch?.[0]?.date ?? flightSegmentsWatch?.[0]?.departureDate ?? null
  const { computedDayId, matchedDay } = usePendingDayResolution(days, primaryDepartureDate)
  const effectiveDayId = pendingDay ? (computedDayId || '') : dayId

  // In pendingDay mode, sync computed dayId to form field so validation passes
  useEffect(() => {
    if (pendingDay && computedDayId) {
      setValue('itineraryDayId', computedDayId, { shouldDirty: false })
    }
  }, [pendingDay, computedDayId, setValue])

  // Use field array for flight segments
  const { fields: segmentFields, append, remove, update } = useFieldArray({
    control,
    name: 'flightSegments',
  })

  // State for collapsible segment cards - track which segment is expanded
  // For new flights, expand first segment by default so user sees the search fields
  const [expandedSegmentIndex, setExpandedSegmentIndex] = useState<number | null>(
    activity ? null : 0
  )

  // Map form segments to FlightSegmentDto[] for FlightJourneyDisplay
  const segmentsForDisplay = useMemo((): FlightSegmentDto[] => {
    if (!flightSegmentsWatch || flightSegmentsWatch.length === 0) return []

    return flightSegmentsWatch.map((seg, index) => ({
      id: seg.id || `temp-${index}`,
      segmentOrder: index,
      airline: seg.airline || null,
      flightNumber: seg.flightNumber || null,
      departureAirportCode: seg.departureAirport || null,
      arrivalAirportCode: seg.arrivalAirport || null,
      departureDate: seg.departureDate || seg.date || null,
      departureTime: seg.departureTime || null,
      departureTimezone: seg.departureTimezone || null,
      departureTerminal: seg.departureTerminal || null,
      departureGate: seg.departureGate || null,
      arrivalDate: seg.arrivalDate || null,
      arrivalTime: seg.arrivalTime || null,
      arrivalTimezone: seg.arrivalTimezone || null,
      arrivalTerminal: seg.arrivalTerminal || null,
      arrivalGate: seg.arrivalGate || null,
    }))
  }, [flightSegmentsWatch])

  // Check if any segment has meaningful data worth displaying
  // (at least one airport code, airline, or flight number)
  const hasDisplayableFlightData = useMemo(() => {
    return segmentsForDisplay.some(
      (seg) =>
        seg.departureAirportCode ||
        seg.arrivalAirportCode ||
        seg.airline ||
        seg.flightNumber
    )
  }, [segmentsForDisplay])

  // Watch all fields for auto-save
  const watchedFields = useWatch({
    control,
    name: FLIGHT_FORM_FIELDS as unknown as (keyof FlightFormData)[],
  })

  // Fetch flight data (for edit mode)
  // Priority: activityIdFromUrl > activity?.id > activityId state
  // activityIdFromUrl is the URL param passed from parent - most reliable during client-side navigation
  // because it's directly from useParams, not affected by keepPreviousData stale data issues.
  // activity?.id may be stale during navigation (due to useActivity's keepPreviousData).
  // activityId state is set after create operation.
  const flightQueryId = activityIdFromUrl || activity?.id || activityId || ''
  const { data: flightData } = useFlight(flightQueryId)

  // Mutations - use effectiveDayId to support pendingDay mode
  const createMutation = useCreateFlight(itineraryId, effectiveDayId)
  const updateMutation = useUpdateFlight(itineraryId, effectiveDayId)


  // Trip month hint for date pickers (opens calendar to trip's month)
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Auto-populate flight date from day context (only for new activities)
  // Handles async loading: dayDate may be undefined on first render, then becomes available
  // Use ref to track if we've already auto-populated (avoid overwriting user changes)
  const dayDateAppliedRef = useRef(false)

  // Reset the ref when dayId changes (handles navigation between different days)
  useEffect(() => {
    dayDateAppliedRef.current = false
  }, [dayId])

  useEffect(() => {
    // Only apply once, only for new activities, only if effectiveDayDate now available
    // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return

    // Use watched segments instead of getValues - ensures we have current form state
    // and reruns effect when field array initializes (previously missed timing window)
    const segments = flightSegmentsWatch
    // Only set if first segment exists and has no date set
    if (segments?.[0] && !segments[0].date) {
      dayDateAppliedRef.current = true
      setValue('flightSegments.0.date', effectiveDayDate, { shouldDirty: false })
      setValue('flightSegments.0.departureDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, flightSegmentsWatch, setValue])

  // Ref to track loaded flight ID (prevents re-seeding on every render)
  const flightIdRef = useRef<string | null>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Ref to track if a save is in progress (prevents dependency array from triggering re-runs)
  const isSavingRef = useRef(false)
  // Ref to access activityId without triggering effect re-runs
  const activityIdRef = useRef<string | null>(activity?.id || null)

  // Sync activityId with URL param (handles client-side navigation)
  // IMPORTANT: Use activityIdFromUrl (URL param) NOT activity?.id because:
  // - activity?.id may be stale during navigation (due to useActivity's keepPreviousData)
  // - activityIdFromUrl is directly from useParams, changes immediately on navigation
  // When navigating away and back to the same flight, React may reuse component
  // but we need to force re-hydration by resetting the ref
  useEffect(() => {
    const targetId = activityIdFromUrl || activity?.id
    if (targetId && targetId !== activityId) {
      flightIdRef.current = null // Reset to force re-hydration
      setActivityId(targetId)
      activityIdRef.current = targetId // Keep ref in sync
    }
    // Cleanup: reset ref on unmount to ensure fresh state on next mount
    return () => {
      flightIdRef.current = null
    }
  }, [activityIdFromUrl, activity?.id, activityId])

  // Keep activityIdRef in sync with activityId state
  useEffect(() => {
    activityIdRef.current = activityId
  }, [activityId])

  // Smart re-seeding: ONLY hydrate when flightData is available
  // The activity prop from parent doesn't include flightDetails, so we must wait
  // for useFlight to return the complete flight data with segments.
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    // IMPORTANT: Only use flightData for hydration - activity prop doesn't have flightDetails
    // This ensures we don't hydrate with empty data and then block re-hydration when
    // the complete flightData arrives (since both have the same ID)
    const sourceData = flightData

    if (sourceData && sourceData.id !== flightIdRef.current) {
      flightIdRef.current = sourceData.id

      setActivityId(sourceData.id)
      setActivityPricingId(sourceData.activityPricingId || null)

      // Build pricing state from loaded flight
      const initialPricing = buildInitialPricingState(sourceData as any)

      // Build defaults for reset
      const defaults = toFlightDefaults(
        {
          itineraryDayId: dayId,
          name: sourceData.name,
          description: sourceData.description || '',
          proposalStatus: coerceStatus(sourceData.proposalStatus),
          flightDetails: coerceFlightDetails(sourceData.flightDetails)
            ?? synthesizeFlightDetailsFromActivity(sourceData),
          totalPriceCents: initialPricing.totalPriceCents,
          taxesAndFeesCents: initialPricing.taxesAndFeesCents,
          currency: trip?.currency || initialPricing.currency,
          pricingType: coercePricingType(sourceData.pricingType),
          confirmationNumber: initialPricing.confirmationNumber,
          commissionTotalCents: initialPricing.commissionTotalCents,
          commissionSplitPercentage: initialPricing.commissionSplitPercentage,
          commissionExpectedDate: initialPricing.commissionExpectedDate,
          termsAndConditions: initialPricing.termsAndConditions,
          cancellationPolicy: initialPricing.cancellationPolicy,
          supplier: initialPricing.supplier,
        },
        dayDate,
        trip?.currency
      )

      // Use queueMicrotask to defer form reset outside React's render cycle
      queueMicrotask(() => {
        if (!cancelled) {
          reset(defaults)
        }
      })
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [flightData, dayId, dayDate, trip?.currency, reset])
  // Note: removed activity from deps - we only use flightData which has complete flight details
  // Note: removed activity from deps - we only use flightData which has complete flight details

  // Build pricingData from form values (memoized)
  const pricingData: PricingData = useMemo(() => {
    void watchedFields
    const values = getValues()
    return {
      // Derive invoiceType from package linkage
      invoiceType: selectedPackageId ? 'part_of_package' : 'individual_item',
      pricingType: (values.pricingType || 'per_person') as PricingData['pricingType'],
      totalPriceCents: values.totalPriceCents || 0,
      taxesAndFeesCents: values.taxesAndFeesCents || 0,
      currency: values.currency || 'CAD',
      confirmationNumber: values.confirmationNumber || '',
      commissionTotalCents: values.commissionTotalCents || 0,
      commissionSplitPercentage: values.commissionSplitPercentage || 0,
      commissionExpectedDate: values.commissionExpectedDate || null,
      termsAndConditions: values.termsAndConditions || '',
      cancellationPolicy: values.cancellationPolicy || '',
      supplier: values.supplier || '',
      pricingBreakdown,
    }
  }, [watchedFields, getValues, selectedPackageId, pricingBreakdown])

  // Auto-save effect with proper validation gating
  // IMPORTANT: Uses refs for activityId and saving state to prevent infinite loops
  // when state changes after successful save (which would re-trigger this effect)
  useEffect(() => {
    // Gate 1: Must be dirty and valid
    if (!isDirty || !isValid || isValidating || isSubmitting) {
      return
    }

    // Gate 2: A save must not already be in progress (use ref, not mutation state)
    if (isSavingRef.current) {
      return
    }

    // Clear previous timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Debounce auto-save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      // Double-check we're not already saving (race condition protection)
      if (isSavingRef.current) {
        return
      }

      isSavingRef.current = true
      const data = getValues()
      const payload = { ...toFlightApiPayload(data), pricingBreakdownJson: pricingBreakdown, bookingDate: activityBookingDate || null }

      setSaveStatus('saving')

      try {
        let response: { id?: string; activityPricingId?: string | null }

        // Use ref to get current activityId (not state, which would cause dependency issues)
        const currentActivityId = activityIdRef.current

        if (currentActivityId) {
          response = await updateMutation.mutateAsync({ id: currentActivityId, data: payload as any })
        } else {
          response = await createMutation.mutateAsync(payload as any)
        }

        // First save (create) - set IDs
        if (!currentActivityId && response.id) {
          setActivityId(response.id)
          activityIdRef.current = response.id // Update ref immediately
        }

        // Extract activityPricingId
        if (response.activityPricingId) {
          setActivityPricingId(response.activityPricingId)
        }

        setSaveStatus('saved')
        setLastSavedAt(new Date())

        // Reset dirty state to prevent re-triggering auto-save
        // This is crucial to break the potential infinite loop
        reset(getValues(), { keepDirty: false, keepValues: true })
      } catch (err) {
        setSaveStatus('error')

        // Map server errors to form fields
        if (err && typeof err === 'object' && 'response' in err) {
          const apiError = err as { response?: { data?: { errors?: Record<string, string[]> } } }
          if (apiError.response?.data?.errors) {
            // Convert API errors format to ServerFieldError[]
            const fieldErrors = Object.entries(apiError.response.data.errors).flatMap(
              ([field, messages]) => messages.map(message => ({ field, message }))
            )
            mapServerErrors(fieldErrors, setError, FLIGHT_FORM_FIELDS)
            scrollToFirstError(errors)
          }
        }

        toast({
          title: 'Auto-save failed',
          description: err instanceof Error ? err.message : 'An error occurred',
          variant: 'destructive',
        })
      } finally {
        isSavingRef.current = false
      }
    }, 1500)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [
    watchedFields,
    isDirty,
    isValid,
    isValidating,
    isSubmitting,
    // REMOVED: activityId, activityPricingId, createMutation.isPending, updateMutation.isPending
    // These caused infinite loops - now using refs instead
    getValues,
    reset,
    setError,
    toast,
    setSaveStatus,
    setLastSavedAt,
    createMutation,
    updateMutation,
    errors,
    pricingBreakdown,
  ])

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing flight details...',
    })
    setAiInput('')
  }

  const addFlightLeg = () => {
    const newIndex = segmentFields.length
    // Pre-populate new segment's departure date from previous segment's arrival date
    const prevArrivalDate = newIndex > 0
      ? getValues(`flightSegments.${newIndex - 1}.arrivalDate`)
      : undefined
    append(createDefaultSegment(prevArrivalDate || dayDate))
    setExpandedSegmentIndex(newIndex)
  }

  const toggleManualEntry = (index: number) => {
    const segment = segmentFields[index]
    if (segment) {
      const currentValues = getValues(`flightSegments.${index}`)
      update(index, { ...currentValues, isManualEntry: !currentValues.isManualEntry })
    }
  }

  // Generate summary text for collapsed segment card
  const getSegmentSummary = (index: number) => {
    const seg = flightSegmentsWatch?.[index]
    if (!seg) return { title: `Segment ${index + 1}`, subtitle: 'No details' }

    const flightId = seg.airline && seg.flightNumber
      ? `${seg.airline}${seg.flightNumber}`
      : seg.flightNumber || `Segment ${index + 1}`

    const route = seg.departureAirport && seg.arrivalAirport
      ? `${seg.departureAirport} → ${seg.arrivalAirport}`
      : seg.departureAirport || seg.arrivalAirport || 'Route TBD'

    const depTime = seg.departureTime?.substring(0, 5) || ''
    const arrTime = seg.arrivalTime?.substring(0, 5) || ''
    const timeRange = depTime && arrTime ? `${depTime} - ${arrTime}` : depTime || arrTime || ''

    return {
      title: flightId,
      route,
      timeRange,
      date: seg.departureDate || seg.date || '',
    }
  }

  // Toggle segment expansion
  const toggleSegmentExpanded = (index: number) => {
    setExpandedSegmentIndex(prev => prev === index ? null : index)
  }

  // Trigger flight search for a segment
  const triggerFlightSearch = (index: number) => {
    const segmentData = getValues(`flightSegments.${index}`)
    const airlineCode = segmentData?.airline || ''
    const flightNumber = segmentData?.flightNumber || ''
    const dateValue = segmentData?.date || ''

    if (!flightNumber.trim()) {
      toast({
        title: 'Missing Flight Number',
        description: 'Enter a flight number to search',
        variant: 'destructive',
      })
      return
    }

    if (!dateValue) {
      toast({
        title: 'Missing Flight Date',
        description: 'Select a flight date to search',
        variant: 'destructive',
      })
      return
    }

    // Combine airline code + flight number for API (e.g., "AC" + "1256" = "AC1256")
    const fullFlightNumber = `${airlineCode}${flightNumber}`.toUpperCase().replace(/\s+/g, '')

    // Reset Amadeus state for new search
    setAmadeusSearchEnabled(false)
    setShowAmadeusResults(false)

    // Set search parameters (triggers the query)
    setSearchingSegmentIndex(index)
    setSearchFlightNumber(fullFlightNumber)
    setSearchDate(dateValue)
    setShowSearchResults(true)
  }

  // Apply flight data from search results to form segment
  const applyFlightData = (index: number, flight: NormalizedFlightStatus) => {
    const depTime = normalizedTimeToFormFields(flight.departure.scheduledTime)
    const arrTime = normalizedTimeToFormFields(flight.arrival.scheduledTime)

    // Update segment fields - prefer IATA code for airline autocomplete, fallback to name
    const airlinePrefix = flight.airline.iataCode || flight.airline.icaoCode || ''
    setValue(`flightSegments.${index}.airline`, flight.airline.iataCode || flight.airline.name || '', { shouldDirty: true })
    // Strip airline code prefix from flight number (e.g., "AC1256" → "1256")
    const rawFlightNum = flight.flightNumber || ''
    const numericOnly = airlinePrefix && rawFlightNum.toUpperCase().startsWith(airlinePrefix.toUpperCase())
      ? rawFlightNum.slice(airlinePrefix.length)
      : rawFlightNum
    setValue(`flightSegments.${index}.flightNumber`, numericOnly, { shouldDirty: true })
    setValue(`flightSegments.${index}.departureAirport`, flight.departure.airportIata || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalAirport`, flight.arrival.airportIata || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.departureDate`, depTime.date || null, { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalDate`, arrTime.date || depTime.date || null, { shouldDirty: true })
    setValue(`flightSegments.${index}.departureTime`, depTime.time || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalTime`, arrTime.time || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.departureTimezone`, flight.departure.timezone || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalTimezone`, flight.arrival.timezone || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.departureTerminal`, flight.departure.terminal || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.departureGate`, flight.departure.gate || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalTerminal`, flight.arrival.terminal || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.arrivalGate`, flight.arrival.gate || '', { shouldDirty: true })

    // Aircraft details (for hover popover)
    setValue(`flightSegments.${index}.aircraftModel`, flight.aircraft?.model || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.aircraftRegistration`, flight.aircraft?.registration || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.aircraftModeS`, flight.aircraft?.modeS || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.aircraftImageUrl`, flight.aircraft?.imageUrl || '', { shouldDirty: true })
    setValue(`flightSegments.${index}.aircraftImageAuthor`, flight.aircraft?.imageAuthor || '', { shouldDirty: true })

    // Switch to manual entry to show filled fields
    setValue(`flightSegments.${index}.isManualEntry`, true, { shouldDirty: true })

    // Close results panel and mark flight as selected (enables visual display)
    setShowSearchResults(false)
    setSearchingSegmentIndex(null)
    setHasSelectedFlight(true)
    // Reset Amadeus state
    setAmadeusSearchEnabled(false)
    setShowAmadeusResults(false)

    toast({
      title: 'Flight Details Applied',
      description: `${flight.flightNumber} - ${flight.departure.airportIata} → ${flight.arrival.airportIata}`,
    })
  }

  // Handler for selecting a flight offer (price shopping results)
  const handleFlightOfferSelect = (offer: NormalizedFlightOffer) => {
    // Clear existing segments and replace with offer segments
    const currentSegments = segmentFields.length
    for (let i = currentSegments - 1; i >= 0; i--) {
      remove(i)
    }

    // Add a segment for each offer segment
    offer.segments.forEach((seg, i) => {
      append(createDefaultSegment())
      const depDate = seg.departure.at ? seg.departure.at.split('T')[0] : ''
      const depTime = seg.departure.at ? seg.departure.at.split('T')[1]?.substring(0, 5) : ''
      const arrDate = seg.arrival.at ? seg.arrival.at.split('T')[0] : ''
      const arrTime = seg.arrival.at ? seg.arrival.at.split('T')[1]?.substring(0, 5) : ''

      const carrier = seg.carrier || ''
      setValue(`flightSegments.${i}.airline`, carrier, { shouldDirty: true })
      // Strip airline code prefix from flight number (e.g., "AC1256" → "1256")
      const rawNum = seg.flightNumber || ''
      const numOnly = carrier && rawNum.toUpperCase().startsWith(carrier.toUpperCase())
        ? rawNum.slice(carrier.length)
        : rawNum
      setValue(`flightSegments.${i}.flightNumber`, numOnly, { shouldDirty: true })
      setValue(`flightSegments.${i}.departureAirport`, seg.departure.iataCode || '', { shouldDirty: true })
      setValue(`flightSegments.${i}.arrivalAirport`, seg.arrival.iataCode || '', { shouldDirty: true })
      setValue(`flightSegments.${i}.departureDate`, depDate || null, { shouldDirty: true })
      setValue(`flightSegments.${i}.arrivalDate`, arrDate || depDate || null, { shouldDirty: true })
      setValue(`flightSegments.${i}.departureTime`, depTime, { shouldDirty: true })
      setValue(`flightSegments.${i}.arrivalTime`, arrTime, { shouldDirty: true })
      setValue(`flightSegments.${i}.departureTerminal`, seg.departure.terminal || '', { shouldDirty: true })
      setValue(`flightSegments.${i}.arrivalTerminal`, seg.arrival.terminal || '', { shouldDirty: true })
      setValue(`flightSegments.${i}.isManualEntry`, true, { shouldDirty: true })
    })

    // Set itinerary display based on segment count
    if (offer.segments.length > 1) {
      setValue('itineraryDisplay', 'multi', { shouldDirty: true })
    }

    setShowFlightOffers(false)
    setHasSelectedFlight(true)

    toast({
      title: 'Flight Offer Applied',
      description: `${offer.validatingAirline} - ${offer.price.currency} ${offer.price.total}`,
    })
  }

  // Handler for "More Results" button - triggers Amadeus search
  const handleMoreResults = () => {
    if (!amadeusSearchEnabled) {
      // First click - enable Amadeus search (query will execute)
      setAmadeusSearchEnabled(true)
      setShowAmadeusResults(true)
    } else {
      // Toggle showing Amadeus results (data already cached by React Query)
      setShowAmadeusResults(!showAmadeusResults)
    }
  }

  const deleteFlightLeg = (index: number) => {
    if (segmentFields.length <= 1) {
      toast({
        title: 'Cannot Delete',
        description: 'At least one flight segment is required.',
        variant: 'destructive',
      })
      return
    }
    remove(index)
  }

  const addSeat = (legIndex: number, travelerName: string) => {
    const currentSeats = getValues(`flightSegments.${legIndex}.seats`) || []
    setValue(`flightSegments.${legIndex}.seats`, [
      ...currentSeats,
      { id: generateId(), travelerName, seatNumber: '' },
    ])
  }

  const removeSeat = (legIndex: number, seatId: string) => {
    const currentSeats = getValues(`flightSegments.${legIndex}.seats`) || []
    setValue(
      `flightSegments.${legIndex}.seats`,
      currentSeats.filter((s) => s.id !== seatId)
    )
  }

  const updateSeatNumber = (legIndex: number, seatId: string, seatNumber: string) => {
    const currentSeats = getValues(`flightSegments.${legIndex}.seats`) || []
    setValue(
      `flightSegments.${legIndex}.seats`,
      currentSeats.map((s) => (s.id === seatId ? { ...s, seatNumber } : s))
    )
  }

  const onSubmit = handleSubmit(async (data) => {
    const payload = { ...toFlightApiPayload(data), pricingBreakdownJson: pricingBreakdown, bookingDate: activityBookingDate || null }

    setSaveStatus('saving')

    try {
      let response: { id?: string; activityPricingId?: string | null }

      if (activityId) {
        response = await updateMutation.mutateAsync({ id: activityId, data: payload as any })
      } else {
        response = await createMutation.mutateAsync(payload as any)
      }

      if (!activityId && response.id) {
        setActivityId(response.id)
      }

      if (response.activityPricingId) {
        setActivityPricingId(response.activityPricingId)
      }

      setSaveStatus('saved')
      setLastSavedAt(new Date())

      // Show success overlay and redirect
      setShowSuccess(true)
    } catch (err) {
      setSaveStatus('error')

      if (err && typeof err === 'object' && 'response' in err) {
        const apiError = err as { response?: { data?: { errors?: Record<string, string[]> } } }
        if (apiError.response?.data?.errors) {
          // Convert API errors format to ServerFieldError[]
          const fieldErrors = Object.entries(apiError.response.data.errors).flatMap(
            ([field, messages]) => messages.map(message => ({ field, message }))
          )
          mapServerErrors(fieldErrors, setError, FLIGHT_FORM_FIELDS)
          scrollToFirstError(errors)
        }
      }

      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      })
    }
  })

  // Update pricing data handler
  const handlePricingUpdate = useCallback((updates: Partial<PricingData>) => {
    // TODO Phase 4: Add invoiceType to form schema
    if ('totalPriceCents' in updates) setValue('totalPriceCents', updates.totalPriceCents ?? 0)
    if ('taxesAndFeesCents' in updates) setValue('taxesAndFeesCents', updates.taxesAndFeesCents ?? 0)
    if ('currency' in updates) setValue('currency', updates.currency ?? 'CAD')
    if ('pricingType' in updates) setValue('pricingType', updates.pricingType as any ?? 'per_person')
    if ('confirmationNumber' in updates) setValue('confirmationNumber', updates.confirmationNumber ?? '')
    if ('commissionTotalCents' in updates) setValue('commissionTotalCents', updates.commissionTotalCents ?? 0)
    if ('commissionSplitPercentage' in updates) setValue('commissionSplitPercentage', updates.commissionSplitPercentage ?? 0)
    if ('commissionExpectedDate' in updates) setValue('commissionExpectedDate', updates.commissionExpectedDate ?? null)
    if ('termsAndConditions' in updates) setValue('termsAndConditions', updates.termsAndConditions ?? '')
    if ('cancellationPolicy' in updates) setValue('cancellationPolicy', updates.cancellationPolicy ?? '')
    if ('supplier' in updates) setValue('supplier', updates.supplier ?? '')
    if ('pricingBreakdown' in updates) setPricingBreakdown(updates.pricingBreakdown ?? null)
  }, [setValue])

  // Handle supplier defaults from BookingDetailsSection
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    // Update supplier commission rate state for CommissionSection
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  // Get travelers from trip data
  const travelers: Array<{ id: string; name: string; initials: string }> = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Flight Updated!' : 'Flight Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Flight Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-blue-500 rounded-lg flex items-center justify-center">
          <Plane className="h-8 w-8 text-white" />
        </div>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            {isEditingTitle ? (
              // Inline title editor
              <div className="flex items-center gap-2 flex-1">
                <Input
                  ref={titleInputRef}
                  className="text-2xl font-semibold h-auto py-1 px-2 max-w-md"
                  value={nameValue || ''}
                  onChange={(e) => {
                    setValue('name', e.target.value, { shouldDirty: true })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setIsEditingTitle(false)
                    }
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false)
                    }
                  }}
                  onBlur={() => setIsEditingTitle(false)}
                  placeholder="Enter flight title..."
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setIsEditingTitle(false)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                {hasCustomTitle && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      resetToGenerated()
                      setIsEditingTitle(false)
                    }}
                    title="Reset to auto-generated title"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              // Title display with edit button
              <>
                <h1
                  className={`text-2xl font-semibold cursor-pointer hover:text-gray-600 transition-colors ${
                    displayTitle ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  onClick={() => {
                    setIsEditingTitle(true)
                    // Focus input after state update
                    requestAnimationFrame(() => titleInputRef.current?.focus())
                  }}
                >
                  {displayTitle || 'Enter flight details...'}
                </h1>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsEditingTitle(true)
                    requestAnimationFrame(() => titleInputRef.current?.focus())
                  }}
                  title="Edit title"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {hasCustomTitle && (
                  <span className="text-xs text-muted-foreground">(custom)</span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Travelers */}
            <div className="flex items-center gap-2" data-field="travelers">
              <span className="text-sm text-gray-600">Travelers ({travelers.length} of {totalTravelers})</span>
              <div className="flex -space-x-2">
                {travelers.map((traveler) => (
                  <Avatar key={traveler.id} className="w-8 h-8 border-2 border-white">
                    <AvatarFallback className="bg-blue-500 text-white text-xs">
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
                onValueChange={(v) => setValue('proposalStatus', v as 'draft' | 'proposing' | 'approved' | 'cancelled', { shouldDirty: true })}
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

        {/* Save Status Indicator */}
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="text-gray-500">Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && lastSavedAt && (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-gray-500">
                Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
              </span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Error - Click Save to retry</span>
            </>
          )}
          {saveStatus === 'idle' && (
            <>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <span className="text-gray-400">Not saved yet</span>
            </>
          )}
        </div>

        {/* Booking Button */}
        <BookingHeaderButton
          activityId={activityId}
          activityName={displayTitle || 'Flight'}
          activityType="flight"
          isBooked={activityIsBooked}
          bookingDate={activityBookingDate}
          isChildOfPackage={isChildOfPackage}
          parentPackageId={parentPackageId}
          parentPackageName={parentPackageName}
          tripId={trip?.id || ''}
          onNavigateToTab={(tab) => { if (tab) setActiveTab(tab) }}
          onBooked={() => {
            setActivityIsBooked(true)
            setActivityBookingDate(new Date().toISOString().split('T')[0] ?? null)
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

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger
            value="general"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            General Info
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="booking"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Booking & Pricing
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Comments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          {/* AI Assist Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setIsAiAssistOpen(!isAiAssistOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
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
                  Save time by describing activities in any format, and letting AI Assist organize the details into the appropriate fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste flight details or describe the flight..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAiSubmit} className="bg-blue-600 hover:bg-blue-700">
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Search Flight Offers Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setShowFlightOffers(!showFlightOffers)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Search Flight Offers</span>
                <span className="text-xs text-gray-400 ml-1">Price shopping</span>
              </div>
              {showFlightOffers ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {showFlightOffers && (
              <div className="p-4 border-t border-gray-200">
                <FlightOffersSearchPanel
                  onSelect={handleFlightOfferSelect}
                  defaultOrigin={segmentFields[0] ? (getValues(`flightSegments.0.departureAirport`) || '') : ''}
                  defaultDestination={segmentFields[0] ? (getValues(`flightSegments.0.arrivalAirport`) || '') : ''}
                  defaultDate={segmentFields[0] ? (getValues(`flightSegments.0.departureDate`) || '') : ''}
                  currencyCode={trip?.currency || 'CAD'}
                />
              </div>
            )}
          </div>

          {/* Flights Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Flights</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Itinerary Display:</span>
                <Select
                  value={itineraryDisplayValue}
                  onValueChange={(v) => setValue('itineraryDisplay', v as 'single' | 'multi' | 'round_trip', { shouldDirty: true })}
                >
                  <SelectTrigger className="w-40" data-field="itineraryDisplay">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITINERARY_DISPLAY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Visual Journey Timeline - only show after user selects a flight from search (or editing existing) */}
            {hasSelectedFlight && hasDisplayableFlightData && (
              <FlightJourneyDisplay
                segments={segmentsForDisplay}
                showDetails={false}
                className="mt-4"
              />
            )}

            {/* Flight Segments - Collapsible Cards */}
            {segmentFields.map((segment, index) => {
              const isExpanded = expandedSegmentIndex === index
              const summary = getSegmentSummary(index)

              return (
                <div key={segment.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Collapsed Header - Always visible */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSegmentExpanded(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleSegmentExpanded(index)
                      }
                    }}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                        <Plane className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{summary.title}</span>
                          <span className="text-gray-500">{summary.route}</span>
                        </div>
                        {(summary.timeRange || summary.date) && (
                          <div className="text-sm text-gray-500">
                            {summary.date && formatDateLocal(summary.date)}
                            {summary.date && summary.timeRange && ' • '}
                            {summary.timeRange}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`Segment ${index + 1} actions`}
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open segment menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => deleteFlightLeg(index)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Segment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content - Form fields */}
                  {isExpanded && (
                    <div className="p-6 pt-2 border-t border-gray-200 space-y-4">
                      {/* Get segment values from watched array */}
                      {(() => {
                  const segmentData = flightSegmentsWatch?.[index]
                  const isManualEntry = segmentData?.isManualEntry ?? false
                  const dateValue = segmentData?.date ?? null
                  const departureDateValue = segmentData?.departureDate ?? null
                  const arrivalDateValue = segmentData?.arrivalDate ?? null
                  const departureTimeValue = segmentData?.departureTime ?? ''
                  const arrivalTimeValue = segmentData?.arrivalTime ?? ''
                  const departureTimezoneValue = segmentData?.departureTimezone ?? ''
                  const arrivalTimezoneValue = segmentData?.arrivalTimezone ?? ''
                  const seatsValue = segmentData?.seats ?? []

                  return !isManualEntry ? (
                    // Flight Search Form
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        {/* Flight Date */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Flight Date</label>
                          <DatePickerEnhanced
                            value={dateValue}
                            onChange={(isoDate) => setValue(`flightSegments.${index}.date`, isoDate ?? null, { shouldDirty: true })}
                            placeholder="YYYY-MM-DD"
                            aria-label="Flight date"
                            defaultMonthHint={tripMonthHint}
                            onKeyDown={(e) => {
                              // Tab from date → airline trigger (skip calendar/clear buttons)
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                // Focus the button inside the wrapper, not the wrapper itself
                                const wrapper = document.querySelector<HTMLElement>(
                                  `[data-trigger="flightSegments.${index}.airline"]`
                                )
                                const button = wrapper?.querySelector<HTMLButtonElement>('button[role="combobox"]')
                                button?.focus({ preventScroll: true })
                              }
                            }}
                          />
                          <TripDateWarning
                            date={dateValue}
                            tripStartDate={trip?.startDate}
                            tripEndDate={trip?.endDate}
                            fieldLabel="Flight date"
                          />
                          {/* Day assignment feedback for pendingDay mode (collapsed view, first segment only) */}
                          {pendingDay && index === 0 && dateValue && matchedDay && (
                            <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5 mt-1">
                              <Check className="h-4 w-4" />
                              This flight will be added to <strong>Day {matchedDay.dayNumber}</strong>
                            </p>
                          )}
                          {pendingDay && index === 0 && dateValue && !matchedDay && (
                            <p className="text-sm text-amber-600 flex items-center gap-1.5 mt-1">
                              <AlertCircle className="h-4 w-4" />
                              No matching day found for this date
                            </p>
                          )}
                        </div>

                        {/* Airline */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Airline / Airline Code</label>
                          <div data-trigger={`flightSegments.${index}.airline`}>
                            <AirlineAutocomplete
                              value={flightSegmentsWatch[index]?.airline || null}
                              onValueChange={(value) => setValue(`flightSegments.${index}.airline`, value || '', { shouldDirty: true })}
                              placeholder="Search airline..."
                            />
                          </div>
                        </div>

                        {/* Flight Number */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Flight Number</label>
                          <div className="flex gap-2">
                            <Input
                              {...register(`flightSegments.${index}.flightNumber`)}
                              placeholder="e.g., AC860"
                              data-field={`flightSegments.${index}.flightNumber`}
                              onKeyDown={(e) => {
                                // Enter key triggers flight search if date and airline are set
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  triggerFlightSearch(index)
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="default"
                              className="bg-blue-600 hover:bg-blue-700 px-6"
                              onClick={() => triggerFlightSearch(index)}
                              disabled={isSearching && searchingSegmentIndex === index}
                            >
                              {isSearching && searchingSegmentIndex === index ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Searching...
                                </>
                              ) : (
                                'Search'
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Search Results Panel */}
                      {showSearchResults && searchingSegmentIndex === index && (
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-medium text-sm">Search Results</h5>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowSearchResults(false)
                                setSearchingSegmentIndex(null)
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {isSearching && (
                            <div className="flex items-center gap-2 text-gray-500 py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Searching for flight {searchFlightNumber}...</span>
                            </div>
                          )}

                          {searchError && !isSearching && (
                            <div className="flex items-center gap-2 text-red-600 py-2">
                              <AlertCircle className="h-4 w-4" />
                              <span>Search failed.</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => refetchSearch()}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2 h-7"
                              >
                                Retry
                              </Button>
                            </div>
                          )}

                          {searchResults && !isSearching && (
                            <>
                              {searchResults.success && searchResults.data?.length ? (
                                <div className="space-y-3">
                                  {searchResults.data.map((flight, fIdx) => (
                                    <FlightSearchResultCard
                                      key={fIdx}
                                      flight={flight}
                                      onApply={() => applyFlightData(index, flight)}
                                    />
                                  ))}

                                  {/* More Results button - try Amadeus for codeshare/alternative flights */}
                                  <div className="pt-2 border-t border-gray-100">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={handleMoreResults}
                                      disabled={isSearchingAmadeus}
                                      className="w-full"
                                    >
                                      {isSearchingAmadeus ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Searching Amadeus...
                                        </>
                                      ) : amadeusResults ? (
                                        showAmadeusResults ? 'Hide Amadeus Results' : 'Show Amadeus Results'
                                      ) : (
                                        'More Results (Amadeus)'
                                      )}
                                    </Button>
                                  </div>

                                  {/* Amadeus results section */}
                                  {showAmadeusResults && amadeusResults && (
                                    <div className="pt-3 space-y-3">
                                      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                                        Amadeus Results
                                      </div>
                                      {amadeusResults.success && amadeusResults.data?.length ? (
                                        amadeusResults.data.map((flight, aIdx) => (
                                          <FlightSearchResultCard
                                            key={`amadeus-${aIdx}`}
                                            flight={flight}
                                            onApply={() => applyFlightData(index, flight)}
                                          />
                                        ))
                                      ) : (
                                        <div className="text-gray-500 py-2 text-sm text-center">
                                          No additional results from Amadeus
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Amadeus error display */}
                                  {showAmadeusResults && amadeusError && !isSearchingAmadeus && (
                                    <div className="flex items-center gap-2 text-amber-600 py-2 text-sm">
                                      <AlertCircle className="h-4 w-4" />
                                      <span>Amadeus search unavailable</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-gray-500 py-4 text-center">
                                  No flights found for {searchFlightNumber} on {searchDate}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleManualEntry(index)}
                      >
                        Add Manually
                      </Button>
                    </>
                  ) : (
                    // Manual Entry Form
                    <div className="space-y-6">
                      {/* Back to Search Button */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleManualEntry(index)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          Back to Search
                        </Button>
                      </div>

                      {/* Airline and Flight Number */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Airline / Airline Code</label>
                          <AirlineAutocomplete
                            value={flightSegmentsWatch[index]?.airline || null}
                            onValueChange={(value) => setValue(`flightSegments.${index}.airline`, value || '', { shouldDirty: true })}
                            placeholder="Search airline..."
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Flight Number</label>
                          <Input
                            {...register(`flightSegments.${index}.flightNumber`)}
                            data-field={`flightSegments.${index}.flightNumber`}
                          />
                        </div>
                      </div>

                      {/* Airport Codes */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Departure Airport</label>
                          <AirportAutocomplete
                            value={flightSegmentsWatch[index]?.departureAirport || null}
                            onValueChange={(value) => setValue(`flightSegments.${index}.departureAirport`, value || '', { shouldDirty: true })}
                            placeholder="Search departure..."
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Arrival Airport</label>
                          <AirportAutocomplete
                            value={flightSegmentsWatch[index]?.arrivalAirport || null}
                            onValueChange={(value) => setValue(`flightSegments.${index}.arrivalAirport`, value || '', { shouldDirty: true })}
                            placeholder="Search arrival..."
                          />
                        </div>
                      </div>

                      {/* Flight Dates - no nested Controllers, direct useWatch values */}
                      <div data-field="startDatetime">
                      <DateRangeInput
                        fromValue={departureDateValue}
                        toValue={arrivalDateValue}
                        onChange={(from, to) => {
                          if (from !== departureDateValue) setValue(`flightSegments.${index}.departureDate`, from, { shouldDirty: true })
                          if (to !== arrivalDateValue) setValue(`flightSegments.${index}.arrivalDate`, to, { shouldDirty: true })
                        }}
                        minDuration={0}
                        strategy="minimum"
                        fromLabel="Departure Date"
                        toLabel="Arrival Date"
                        showDuration
                        fromPlaceholder="YYYY-MM-DD"
                        toPlaceholder="YYYY-MM-DD"
                      />
                      </div>
                      <div className="flex gap-4 mt-1">
                        <div className="flex-1">
                          <TripDateWarning
                            date={departureDateValue}
                            tripStartDate={trip?.startDate}
                            tripEndDate={trip?.endDate}
                            fieldLabel="Departure date"
                          />
                        </div>
                        <div className="flex-1">
                          <TripDateWarning
                            date={arrivalDateValue}
                            tripStartDate={trip?.startDate}
                            tripEndDate={trip?.endDate}
                            fieldLabel="Arrival date"
                          />
                        </div>
                      </div>

                      {/* Day assignment feedback for pendingDay mode (first segment only) */}
                      {pendingDay && index === 0 && (
                        <div className="mt-2">
                          {(dateValue || departureDateValue) && matchedDay ? (
                            <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                              <Check className="h-4 w-4" />
                              This flight will be added to <strong>Day {matchedDay.dayNumber}</strong>
                            </p>
                          ) : (dateValue || departureDateValue) && !matchedDay ? (
                            <p className="text-sm text-amber-600 flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4" />
                              No matching day found for this date
                            </p>
                          ) : null}
                        </div>
                      )}

                      {/* Departure Time */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Departure Time</label>
                        <div className="grid grid-cols-2 gap-4">
                          <TimePicker
                            value={departureTimeValue}
                            onChange={(time) => setValue(`flightSegments.${index}.departureTime`, time ?? '', { shouldDirty: true })}
                            placeholder="HH:MM"
                            aria-label="Departure time"
                          />
                          <Select
                            value={departureTimezoneValue}
                            onValueChange={(v) => setValue(`flightSegments.${index}.departureTimezone`, v, { shouldDirty: true })}
                          >
                            <SelectTrigger data-field={`flightSegments.${index}.departureTimezone`}>
                              <SelectValue placeholder="- Timezone" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EST">EST</SelectItem>
                              <SelectItem value="CST">CST</SelectItem>
                              <SelectItem value="MST">MST</SelectItem>
                              <SelectItem value="PST">PST</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Arrival Time */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Arrival Time</label>
                        <div className="grid grid-cols-2 gap-4">
                          <TimePicker
                            value={arrivalTimeValue}
                            onChange={(time) => setValue(`flightSegments.${index}.arrivalTime`, time ?? '', { shouldDirty: true })}
                            placeholder="HH:MM"
                            aria-label="Arrival time"
                          />
                          <Select
                            value={arrivalTimezoneValue}
                            onValueChange={(v) => setValue(`flightSegments.${index}.arrivalTimezone`, v, { shouldDirty: true })}
                          >
                            <SelectTrigger data-field={`flightSegments.${index}.arrivalTimezone`}>
                              <SelectValue placeholder="- Timezone" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EST">EST</SelectItem>
                              <SelectItem value="CST">CST</SelectItem>
                              <SelectItem value="MST">MST</SelectItem>
                              <SelectItem value="PST">PST</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Terminal and Gate */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Departure Terminal</label>
                          <Input
                            {...register(`flightSegments.${index}.departureTerminal`)}
                            data-field={`flightSegments.${index}.departureTerminal`}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Departure Gate</label>
                          <Input
                            {...register(`flightSegments.${index}.departureGate`)}
                            data-field={`flightSegments.${index}.departureGate`}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Arrival Terminal</label>
                          <Input
                            {...register(`flightSegments.${index}.arrivalTerminal`)}
                            data-field={`flightSegments.${index}.arrivalTerminal`}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Arrival Gate</label>
                          <Input
                            {...register(`flightSegments.${index}.arrivalGate`)}
                            data-field={`flightSegments.${index}.arrivalGate`}
                          />
                        </div>
                      </div>

                      {/* Seats Section - using watched value directly */}
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">Seats</label>
                        <div className="space-y-2">
                          {travelers.map((traveler) => {
                            const travelerSeat = seatsValue.find(
                              (seat) => seat.travelerName === traveler.name
                            )
                            return (
                              <div key={traveler.id} className="flex items-center gap-2">
                                <span className="text-sm flex-1">{traveler.name}</span>
                                {travelerSeat ? (
                                  <>
                                    <Input
                                      placeholder="Seat #"
                                      value={travelerSeat.seatNumber}
                                      onChange={(e) => updateSeatNumber(index, travelerSeat.id!, e.target.value)}
                                      className="w-24"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeSeat(index, travelerSeat.id!)}
                                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addSeat(index, traveler.name)}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add Seat
                                  </Button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })()}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add Segment Button */}
            <Button
              type="button"
              variant="outline"
              onClick={addFlightLeg}
              className="w-full border-dashed"
            >
              + Add Segment
            </Button>
          </div>

          {/* Description Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              {...register('description')}
              placeholder="Add a description for this flight..."
              className="min-h-[100px]"
              data-field="description"
            />
            <FieldError message={getErrorMessage(errors, 'description')} />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="flight"
              title="Flight Photos"
              description="Boarding passes, seat maps, and flight experience photos"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the flight first to upload media.</p>
              <p className="text-sm mt-1">Media will be available after the flight is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the flight first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the flight is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="booking" className="mt-6 space-y-6">
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

          {/* Credit Card Authorization & Payment */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Credit Card Authorization & Payment</h3>
            <PaymentScheduleSection
              activityPricingId={activityPricingId}
              totalPriceCents={pricingData.totalPriceCents}
              currency={pricingData.currency}
              tripId={trip?.id || ''}
            />
          </div>

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
            userSplitValue={userProfile?.commissionSettings?.splitValue}
            userSplitType={userProfile?.commissionSettings?.splitType}
          />
        </TabsContent>

        <TabsContent value="comments" className="mt-6">
          {isEditing && activity?.id ? (
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

      {/* Form Actions */}
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} className="bg-blue-600 hover:bg-blue-700">
          {isEditing ? 'Save Changes' : 'Create Flight'}
        </Button>
      </div>

      {/* Edit Travelers Dialog */}
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
