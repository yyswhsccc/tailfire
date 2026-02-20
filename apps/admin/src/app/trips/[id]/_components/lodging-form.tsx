'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSearchParams, useParams } from 'next/navigation'
import Link from 'next/link'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, ChevronDown, ChevronUp, Sparkles, Loader2, Check, AlertCircle, Package, CalendarCheck } from 'lucide-react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { useCreateLodging, useUpdateLodging, useLodging } from '@/hooks/use-lodging'
import { useBooking, useBookings, useUnlinkActivities, bookingKeys } from '@/hooks/use-bookings'
import { useQueryClient } from '@tanstack/react-query'
import { activityKeys } from '@/hooks/use-activities'
import { useMarkActivityBooked } from '@/hooks/use-activity-bookings'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { itineraryDayKeys } from '@/hooks/use-itinerary-days'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { PaymentScheduleSection } from './payment-schedule-section'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { buildInitialPricingState, type PricingData, type PricingBreakdownItem, type ValidationErrors } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { dollarsToCents } from '@/lib/pricing/currency-helpers'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { AmenitiesSelector } from '@/components/ui/amenities-selector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DocumentUploader } from '@/components/document-uploader'
import { MarkActivityBookedModal, BookingStatusBadge } from '@/components/activities/mark-activity-booked-modal'
import { ChildOfPackageBookingSection } from '@/components/activities/child-of-package-booking-section'
import { ComponentMediaTab } from '@/components/shared'
import { HotelSearchPanel } from '@/components/hotel-search-panel'
import type { NormalizedHotelResult } from '@tailfire/shared-types'
import {
  useImportHotelPhotos,
  useHotelEnrichment,
  mergeHotelAmenities,
  getAllStoredHotelPhotoKeys,
  getStoredHotelPhotos,
  clearStoredHotelPhotos,
  convertPhotosToImportDto,
} from '@/hooks/use-hotels'
import { useAmenitiesGrouped } from '@/hooks/use-amenities'
import {
  lodgingFormSchema,
  toLodgingDefaults,
  toApiPayload,
  LODGING_FORM_FIELDS,
  type LodgingFormData,
} from '@/lib/validation'
import { mapServerErrors, scrollToFirstError, getErrorMessage, getFirstError, formatFieldLabel } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { format } from 'date-fns'
import { parseISODate, getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'
import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'

// Helper to convert Date to ISO string for UI components
const dateToString = (date: Date | null | undefined): string | null => {
  if (!date) return null
  return format(date, 'yyyy-MM-dd')
}

// Helper to convert string to Date for form state
// Uses parseISODate to parse YYYY-MM-DD as local midnight (not UTC)
const stringToDate = (str: string | null | undefined): Date | null => {
  return parseISODate(str)
}

interface LodgingFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  trip?: any // TODO: proper type
  onSuccess?: () => void
  onCancel?: () => void
  /** When true, user must select a date to determine which day to assign activity to */
  pendingDay?: boolean
  /** Available itinerary days (required when pendingDay is true) */
  days?: ItineraryDayWithActivitiesDto[]
}

const STATUSES = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const ROOM_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'suite', label: 'Suite' },
  { value: 'junior_suite', label: 'Junior Suite' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'villa', label: 'Villa' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'other', label: 'Other' },
] as const


// Auto-save watched fields (trigger save when these change)
const AUTO_SAVE_FIELDS = [
  'status',
  'description',
  'lodgingDetails.propertyName',
  'lodgingDetails.address',
  'lodgingDetails.phone',
  'lodgingDetails.website',
  'lodgingDetails.checkInDate',
  'lodgingDetails.checkInTime',
  'lodgingDetails.checkOutDate',
  'lodgingDetails.checkOutTime',
  'lodgingDetails.timezone',
  'lodgingDetails.roomType',
  'lodgingDetails.roomCount',
  'lodgingDetails.amenities',
  'lodgingDetails.specialRequests',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'confirmationNumber',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
  'termsAndConditions',
  'cancellationPolicy',
  'supplier',
] as const

export function LodgingForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: LodgingFormProps) {
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

  // The effective dayId: derived from check-in date in pendingDay mode, otherwise use prop
  // Note: checkInDateValue is watched below at line ~242, day resolution happens after that

  // Get tripId from route params (with guard)
  const params = useParams()
  const tripId = (params?.id as string) || ''

  // Query client for cache invalidation
  const queryClient = useQueryClient()

  // Fetch package info if activity is linked (handles 404 gracefully)
  const { data: linkedBooking, isError: bookingError } = useBooking(activity?.packageId ?? null)
  const unlinkMutation = useUnlinkActivities()

  // Determine if package was deleted (activity has bookingId but fetch failed)
  const packageDeleted = activity?.packageId && bookingError

  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [showTravelersDialog, setShowTravelersDialog] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const { returnToItinerary } = useActivityNavigation()
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'booking' ? 'booking' : 'general'
  })

  // Track booking status from activity data
  const [activityIsBooked, setActivityIsBooked] = useState(activity?.isBooked ?? false)
  const [activityBookingDate, setActivityBookingDate] = useState<string | null>(activity?.bookingDate ?? null)

  // Package linkage state for PricingSection
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(activity?.packageId ?? null)
  const [pricingBreakdown, setPricingBreakdown] = useState<PricingBreakdownItem[] | null>(
    (activity as any)?.pricingBreakdownJson ?? null
  )
  const { data: packagesData } = useBookings({ tripId })
  const availablePackages = useMemo(
    () => packagesData?.map(pkg => ({ id: pkg.id, name: pkg.name })) ?? [],
    [packagesData]
  )

  // Check if this activity is a child of a package (pricing controlled by parent)
  const { isChildOfPackage, parentPackageName, parentPackageId } = useIsChildOfPackage(activity)

  // Fetch user profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)
  // Note: lodging-form already has a guard that prevents auto-save for new activities
  // (if (!activityId) return) so createInProgressRef is not needed here

  // Activity pricing ID (gated on this for payment schedule)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // Track photo import state (use ref to track attempted imports without re-renders)
  const photoImportAttemptedRef = useRef<Set<string>>(new Set())
  const importHotelPhotos = useImportHotelPhotos()
  const enrichHotelAmenities = useHotelEnrichment()

  // Fetch amenities from database (grouped by category)
  const { data: amenitiesGrouped, isLoading: amenitiesLoading } = useAmenitiesGrouped()

  // Auto-save status tracking (with date validation)
  const { saveStatus, setSaveStatus, lastSavedAt, setLastSavedAt } = useSaveStatus({
    activityId: activity?.id,
    updatedAt: activity?.updatedAt,
  })
  const failureToastShown = useRef(false)
  const lastSavedSnapshotRef = useRef<string | null>(null)

  // Pricing validation errors for PricingSection component (not used yet - future integration)
  const [pricingValidationErrors] = useState<ValidationErrors>({})

  // Initialize form with RHF + Zod
  // Priority: dayDate (dropped on day) > trip start date > today
  const form = useForm<LodgingFormData>({
    resolver: zodResolver(lodgingFormSchema),
    defaultValues: toLodgingDefaults({ itineraryDayId: dayId }, dayDate, trip?.startDate),
    mode: 'onSubmit', // Validate on submit to avoid render-time issues
  })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    setError,
    formState: { errors, isDirty, isValid, isValidating, isSubmitting },
  } = form

  // Compute trip month hint once for date pickers (opens to trip start month)
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Use form.watch() for pricingData useMemo (values change via watchedFields dependency)
  const { watch } = form

  // Watch specific fields for auto-save (single subscription)
  const watchedFields = useWatch({
    control,
    name: AUTO_SAVE_FIELDS as unknown as (keyof LodgingFormData)[],
  })

  // useWatch for custom components (Selects, DatePickers, TimePickers)
  // Using individual useWatch calls to avoid Controller registration issues
  const statusValue = useWatch({ control, name: 'status' })
  const checkInDateValue = useWatch({ control, name: 'lodgingDetails.checkInDate' })
  const checkInTimeValue = useWatch({ control, name: 'lodgingDetails.checkInTime' })
  const checkOutDateValue = useWatch({ control, name: 'lodgingDetails.checkOutDate' })
  const checkOutTimeValue = useWatch({ control, name: 'lodgingDetails.checkOutTime' })
  const timezoneValue = useWatch({ control, name: 'lodgingDetails.timezone' })
  const roomTypeValue = useWatch({ control, name: 'lodgingDetails.roomType' })
  const amenitiesValue = useWatch({ control, name: 'lodgingDetails.amenities' })
  const roomCountValue = useWatch({ control, name: 'lodgingDetails.roomCount' })
  const propertyNameValue = useWatch({ control, name: 'lodgingDetails.propertyName' })

  // Auto-generate activity name from property name
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'lodging',
    control,
    setValue,
    propertyName: propertyNameValue,
  })

  // Derive dayId from check-in date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, dateToString(checkInDateValue))
  const effectiveDayId = pendingDay ? (computedDayId || '') : dayId

  // In pendingDay mode, sync computed dayId to form field so validation passes
  useEffect(() => {
    if (pendingDay && computedDayId) {
      setValue('itineraryDayId', computedDayId, { shouldDirty: false })
    }
  }, [pendingDay, computedDayId, setValue])

  // Auto-populate check-in date from day context (handles async loading)
  // Lodging uses Date objects; convert dayDate string to Date
  // Use ref to track if we've already auto-populated (avoid overwriting user changes)
  const dayDateAppliedRef = useRef(false)

  // Reset the ref when dayId changes (handles navigation between different days)
  useEffect(() => {
    dayDateAppliedRef.current = false
  }, [dayId])

  // Auto-populate check-in/check-out dates from day context
  // Uses watched checkInDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!checkInDateValue) {
      dayDateAppliedRef.current = true
      // Parse effectiveDayDate at noon to avoid timezone edge cases
      const dateObj = new Date(effectiveDayDate + 'T12:00:00')
      setValue('lodgingDetails.checkInDate', dateObj, { shouldDirty: false })
      // Also set checkout to day after
      const checkoutDate = new Date(dateObj)
      checkoutDate.setDate(checkoutDate.getDate() + 1)
      setValue('lodgingDetails.checkOutDate', checkoutDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, checkInDateValue, setValue])

  // Fetch lodging data (for edit mode)
  const { data: lodgingData } = useLodging(activityId || '')

  // Mutations
  // Mutations - use effectiveDayId to support pendingDay mode
  const createLodging = useCreateLodging(itineraryId, effectiveDayId)
  const updateLodging = useUpdateLodging(itineraryId, effectiveDayId)
  const markActivityBooked = useMarkActivityBooked()

  // Handler for marking activity as booked
  const handleMarkAsBooked = async (newBookingDate: string) => {
    if (!activityId) {
      throw new Error('Activity must be saved before marking as booked')
    }

    const result = await markActivityBooked.mutateAsync({
      activityId,
      data: { bookingDate: newBookingDate },
    })

    // Update local state - preserve YYYY-MM-DD format
    setActivityIsBooked(true)
    setActivityBookingDate(newBookingDate)

    // Show warning if payment schedule is missing
    if (result.paymentScheduleMissing) {
      toast({
        title: 'Payment schedule missing',
        description: 'This activity is booked but has no payment schedule configured.',
      })
    }
  }

  // Ref to track loaded lodging ID (prevents re-seeding on every render)
  const lodgingIdRef = useRef<string | null>(null)

  // Smart re-seeding: only when lodging ID actually changes
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (lodgingData && lodgingData.id !== lodgingIdRef.current) {
      lodgingIdRef.current = lodgingData.id

      setActivityId(lodgingData.id)
      setActivityPricingId(lodgingData.activityPricingId || null)

      // Seed form from loaded lodging
      const initialPricing = buildInitialPricingState(lodgingData as any)
      const serverData = {
        itineraryDayId: dayId,
        componentType: 'lodging' as const,
        name: lodgingData.name,
        description: lodgingData.description,
        status: lodgingData.status as 'proposed' | 'confirmed' | 'cancelled',
        totalPriceCents: initialPricing.totalPriceCents,
        taxesAndFeesCents: initialPricing.taxesAndFeesCents,
        currency: trip?.currency || initialPricing.currency,
        confirmationNumber: initialPricing.confirmationNumber,
        pricingType: (lodgingData.pricingType || 'per_room') as 'per_room' | 'per_person' | 'total',
        lodgingDetails: lodgingData.lodgingDetails,
        commissionTotalCents: initialPricing.commissionTotalCents,
        commissionSplitPercentage: initialPricing.commissionSplitPercentage,
        commissionExpectedDate: initialPricing.commissionExpectedDate,
        termsAndConditions: initialPricing.termsAndConditions,
        cancellationPolicy: initialPricing.cancellationPolicy,
        supplier: initialPricing.supplier,
      }

      // Use queueMicrotask to defer form reset outside React's render cycle,
      // preventing "Cannot update a component while rendering" warnings
      queueMicrotask(() => {
        if (!cancelled) {
          reset(toLodgingDefaults(serverData as any, dayDate, trip?.startDate), { keepDirty: false })
          // Update snapshot to prevent immediate re-save
          lastSavedSnapshotRef.current = JSON.stringify(getValues())
        }
      })
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [lodgingData, dayId, trip?.currency, dayDate, trip?.startDate, getValues, reset])

  // Note: Date re-seeding effect removed to fix Controller warning.
  // The defaultValues already uses dayDate at initialization, which covers
  // the common case where dayDate is available when the form mounts.

  // Save function (create vs update)
  const saveFn = useCallback(
    async (data: LodgingFormData) => {
      // Convert form data to API payload with proper type conversions
      const apiPayload = toApiPayload(data)
      const payload = { ...apiPayload, pricingBreakdownJson: pricingBreakdown }

      if (activityId) {
        return updateLodging.mutateAsync({ id: activityId, data: payload })
      } else {
        return createLodging.mutateAsync(payload)
      }
    },
    [activityId, createLodging, updateLodging, pricingBreakdown]
  )

  // Auto-save effect with proper gating
  useEffect(() => {
    // Gate conditions per plan spec
    if (!isDirty || !isValid || isValidating || isSubmitting) {
      return
    }
    if (createLodging.isPending || updateLodging.isPending) {
      return
    }
    if (!dayId) {
      return
    }
    // Don't auto-save for new activities - require explicit "Create" action
    // This prevents duplicate creation when user clicks "Create Lodging" while auto-save timer is pending
    if (!activityId) {
      return
    }

    // Compare against last saved snapshot
    const currentSnapshot = JSON.stringify(getValues())
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return
    }

    const timer = setTimeout(async () => {
      setSaveStatus('saving')

      try {
        const response = await saveFn(getValues())

        // Update activity ID on create
        if (!activityId && response.id) {
          setActivityId(response.id)
        }
        if (response.activityPricingId && response.activityPricingId !== activityPricingId) {
          setActivityPricingId(response.activityPricingId)
        }

        // Reset dirty state and update snapshot
        reset(getValues(), { keepDirty: false })
        lastSavedSnapshotRef.current = JSON.stringify(getValues())

        setSaveStatus('saved')
        setLastSavedAt(new Date())
        failureToastShown.current = false
      } catch (err: any) {
        setSaveStatus('error')

        // Map server validation errors to form fields
        if (err.fieldErrors) {
          mapServerErrors(err.fieldErrors, setError, LODGING_FORM_FIELDS)
        }

        // Show toast only once per error session
        if (!failureToastShown.current) {
          toast({
            title: 'Auto-save failed',
            description: err.message || 'Please check the form for errors.',
            variant: 'destructive',
          })
          failureToastShown.current = true
          setTimeout(() => {
            failureToastShown.current = false
          }, 5000)
        }
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [
    watchedFields,
    isDirty,
    isValid,
    isValidating,
    isSubmitting,
    createLodging.isPending,
    updateLodging.isPending,
    dayId,
    activityId,
    activityPricingId,
    getValues,
    saveFn,
    reset,
    setError,
    setLastSavedAt,
    setSaveStatus,
    toast,
  ])

  // Photo import effect: triggers when activityId becomes available and there are stored photos
  useEffect(() => {
    console.info('[PhotoImport] Effect triggered', { activityId, isPending: importHotelPhotos.isPending })

    // Skip if no activityId or import in progress
    if (!activityId || importHotelPhotos.isPending) {
      console.info('[PhotoImport] Skipping - no activityId or import pending')
      return
    }

    // Check if there are any stored hotel photos to import
    const storedPhotoKeys = getAllStoredHotelPhotoKeys()
    console.info('[PhotoImport] Stored photo keys:', storedPhotoKeys)
    if (storedPhotoKeys.length === 0) {
      console.info('[PhotoImport] No stored photos found in sessionStorage')
      return
    }

    // Process each stored hotel's photos (typically just one)
    storedPhotoKeys.forEach(async (placeId) => {
      // Skip if already attempted for this activity+placeId combination
      const attemptKey = `${activityId}_${placeId}`
      if (photoImportAttemptedRef.current.has(attemptKey)) {
        console.info('[PhotoImport] Already attempted for:', attemptKey)
        return
      }

      // Mark as attempted
      photoImportAttemptedRef.current.add(attemptKey)

      const storedData = getStoredHotelPhotos(placeId)
      console.info('[PhotoImport] Stored data for', placeId, ':', {
        hasData: !!storedData,
        photoCount: storedData?.photos?.length || 0,
        firstPhoto: storedData?.photos?.[0],
        hasPhotoReference: storedData?.photos?.[0]?.photoReference ? 'YES' : 'NO',
      })

      if (!storedData || !storedData.photos.length) {
        console.info('[PhotoImport] No photos in stored data')
        clearStoredHotelPhotos(placeId)
        return
      }

      try {
        const photosDto = convertPhotosToImportDto(storedData.photos)
        console.info('[PhotoImport] Converted to DTO:', {
          inputCount: storedData.photos.length,
          outputCount: photosDto.length,
          firstDto: photosDto[0],
        })

        if (photosDto.length === 0) {
          console.info('[PhotoImport] convertPhotosToImportDto returned empty - photos missing photoReference field!')
          clearStoredHotelPhotos(placeId)
          return
        }

        console.info('[PhotoImport] Calling importHotelPhotos.mutateAsync...')
        await importHotelPhotos.mutateAsync({
          activityId,
          entityType: 'accommodation',
          photos: photosDto,
          hotelName: storedData.hotelName,
        })

        console.info('[PhotoImport] Import successful!')
        // Clear stored photos on success
        clearStoredHotelPhotos(placeId)
      } catch (error) {
        console.error('[PhotoImport] Import failed:', error)
        // Error is handled in the mutation onError callback
        // Clear stored photos to prevent retry loop
        clearStoredHotelPhotos(placeId)
      }
    })
  }, [activityId, importHotelPhotos])

  // Build pricingData for PricingSection component
  // Uses watch() which reads current values without triggering re-renders
  // Dependency on watchedFields ensures this updates when form values change
  const pricingData = useMemo((): PricingData => {
    return {
      // Derive invoiceType from package linkage
      invoiceType: selectedPackageId ? 'part_of_package' : 'individual_item',
      pricingType: (watch('pricingType') || 'per_room') as PricingData['pricingType'],
      totalPriceCents: watch('totalPriceCents') || 0,
      taxesAndFeesCents: watch('taxesAndFeesCents') || 0,
      currency: watch('currency') || 'CAD',
      confirmationNumber: watch('confirmationNumber') || '',
      commissionTotalCents: watch('commissionTotalCents') || 0,
      commissionSplitPercentage: watch('commissionSplitPercentage') || 0,
      commissionExpectedDate: dateToString(watch('commissionExpectedDate')),
      termsAndConditions: watch('termsAndConditions') || '',
      cancellationPolicy: watch('cancellationPolicy') || '',
      supplier: watch('supplier') || '',
      pricingBreakdown,
    }
  }, [watch, watchedFields, selectedPackageId, pricingBreakdown]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle pricing section updates
  const handlePricingUpdate = useCallback(
    (updates: Partial<PricingData>) => {
      if ('pricingBreakdown' in updates) {
        setPricingBreakdown(updates.pricingBreakdown ?? null)
      }
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'pricingBreakdown') return
        // Convert commissionExpectedDate string back to Date (form stores Date objects)
        if (key === 'commissionExpectedDate' && typeof value === 'string') {
          setValue('commissionExpectedDate', stringToDate(value), { shouldDirty: true, shouldValidate: true })
        } else {
          setValue(key as keyof LodgingFormData, value as any, { shouldDirty: true, shouldValidate: true })
        }
      })
    },
    [setValue]
  )

  // Handle supplier defaults from BookingDetailsSection
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    // Update supplier commission rate state for CommissionSection
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  // Toggle amenity
  const toggleAmenity = (amenity: string) => {
    const currentAmenities = getValues('lodgingDetails.amenities') || []
    const newAmenities = currentAmenities.includes(amenity)
      ? currentAmenities.filter(a => a !== amenity)
      : [...currentAmenities, amenity]
    setValue('lodgingDetails.amenities', newAmenities, { shouldDirty: true })
  }

  // Hotel search auto-fill
  const handleHotelSelect = useCallback(
    (hotel: NormalizedHotelResult) => {
      // Property name
      if (hotel.name) {
        setValue('lodgingDetails.propertyName', hotel.name, { shouldDirty: true })
      }

      // Address
      if (hotel.location?.address) {
        setValue('lodgingDetails.address', hotel.location.address, { shouldDirty: true })
      }

      // Phone
      if (hotel.phone) {
        setValue('lodgingDetails.phone', hotel.phone, { shouldDirty: true })
      }

      // Website
      if (hotel.website) {
        setValue('lodgingDetails.website', hotel.website, { shouldDirty: true })
      }

      // Description (from Google Places editorial summary)
      if (hotel.description) {
        setValue('description', hotel.description, { shouldDirty: true })
      }

      // Amenities (merge with existing)
      if (hotel.amenities && hotel.amenities.length > 0) {
        const currentAmenities = getValues('lodgingDetails.amenities') || []
        const mergedAmenities = [...new Set([...currentAmenities, ...hotel.amenities])]
        setValue('lodgingDetails.amenities', mergedAmenities, { shouldDirty: true })
      }

      // Auto-fill pricing from Amadeus offers
      const firstOffer = hotel.offers?.[0]
      if (firstOffer) {
        if (firstOffer.price?.total) {
          setValue('totalPriceCents', dollarsToCents(firstOffer.price.total), { shouldDirty: true })
        }
        if (firstOffer.price?.currency) {
          setValue('currency', firstOffer.price.currency, { shouldDirty: true })
        }
        if (firstOffer.cancellationPolicy?.description) {
          setValue('cancellationPolicy', firstOffer.cancellationPolicy.description, { shouldDirty: true })
        } else if (firstOffer.cancellationPolicy?.refundable !== undefined) {
          setValue('cancellationPolicy', firstOffer.cancellationPolicy.refundable ? 'Refundable' : 'Non-refundable', { shouldDirty: true })
        }
        if (firstOffer.roomType) {
          // Map Amadeus room type to form values if possible
          const roomTypeLower = firstOffer.roomType.toLowerCase()
          const matchedType = ROOM_TYPES.find(rt => roomTypeLower.includes(rt.value))
          if (matchedType) {
            setValue('lodgingDetails.roomType', matchedType.value, { shouldDirty: true })
          }
        }
      }

      // Build a rich description with rating and board type
      let enrichedDescription = hotel.description || ''
      if (hotel.rating) {
        const ratingText = `Rating: ${hotel.rating.toFixed(1)}/5`
        const reviewsText = hotel.reviewCount ? ` (${hotel.reviewCount} reviews)` : ''
        if (enrichedDescription) {
          enrichedDescription = `${ratingText}${reviewsText}\n\n${enrichedDescription}`
        } else {
          enrichedDescription = `${ratingText}${reviewsText}`
        }
      }
      // Prepend board type from Amadeus offer
      if (firstOffer?.boardType && firstOffer.boardType !== 'ROOM_ONLY') {
        const boardLabels: Record<string, string> = {
          BREAKFAST: 'Breakfast included',
          HALF_BOARD: 'Half board (breakfast + dinner)',
          FULL_BOARD: 'Full board (all meals)',
          ALL_INCLUSIVE: 'All inclusive',
        }
        const boardLabel = boardLabels[firstOffer.boardType]
        if (boardLabel) {
          enrichedDescription = enrichedDescription
            ? `${boardLabel}\n\n${enrichedDescription}`
            : boardLabel
        }
      }
      if (enrichedDescription) {
        setValue('description', enrichedDescription, { shouldDirty: true })
      }

      // Store hotel data for photo import (will be used after activity is saved)
      if (hotel.photos && hotel.photos.length > 0 && hotel.placeId) {
        const photosToStore = hotel.photos.slice(0, 5) // Limit to 5 photos
        console.info('[PhotoImport] Storing photos to sessionStorage:', {
          placeId: hotel.placeId,
          photoCount: photosToStore.length,
          firstPhoto: photosToStore[0],
          hasPhotoReference: photosToStore[0]?.photoReference ? 'YES' : 'NO',
        })
        // Store photos in session storage for import after save
        sessionStorage.setItem(
          `hotel_photos_${hotel.placeId}`,
          JSON.stringify({
            placeId: hotel.placeId,
            photos: photosToStore,
            hotelName: hotel.name,
          })
        )
      } else {
        console.info('[PhotoImport] Not storing photos:', {
          hasPhotos: !!hotel.photos,
          photoCount: hotel.photos?.length || 0,
          placeId: hotel.placeId,
        })
      }

      // Enrich hotel amenities from Booking.com (async, non-blocking)
      // This provides WiFi, Pool, Spa, Fitness Center, etc. that Google Places lacks
      if (hotel.placeId && hotel.name && hotel.location?.latitude && hotel.location?.longitude) {
        // Get check-in/out dates from form if available
        const checkInDate = getValues('lodgingDetails.checkInDate')
        const checkOutDate = getValues('lodgingDetails.checkOutDate')

        enrichHotelAmenities.mutateAsync({
          placeId: hotel.placeId,
          hotelName: hotel.name,
          latitude: hotel.location.latitude,
          longitude: hotel.location.longitude,
          checkIn: checkInDate ? dateToString(checkInDate) ?? undefined : undefined,
          checkOut: checkOutDate ? dateToString(checkOutDate) ?? undefined : undefined,
        }).then((result) => {
          if (result.amenities && result.amenities.length > 0) {
            // Merge with current amenities (Google Places + any user additions)
            const currentAmenities = getValues('lodgingDetails.amenities') || []
            const merged = mergeHotelAmenities(currentAmenities, result.amenities)
            setValue('lodgingDetails.amenities', merged, { shouldDirty: true })
          }
        }).catch(() => {
          // Silently ignore - enrichment is optional
        })
      }

      const photoCount = hotel.photos?.length || 0
      toast({
        title: 'Hotel details filled',
        description: `Auto-filled from ${hotel.name}${photoCount > 0 ? ` (${photoCount} photos available)` : ''}`,
      })
    },
    [setValue, getValues, toast, enrichHotelAmenities]
  )

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing lodging details...',
    })
    setAiInput('')
  }

  // Unlink activity from package
  const handleUnlinkFromPackage = async () => {
    if (!activity?.packageId || !activity?.id) return

    const bookingId = activity.packageId

    try {
      await unlinkMutation.mutateAsync({
        bookingId,
        activityIds: [activity.id],
      })

      // Invalidate caches so banner disappears immediately
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(dayId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      // Invalidate trip totals so bookings page updates
      if (linkedBooking?.tripId) {
        queryClient.invalidateQueries({ queryKey: bookingKeys.tripTotals(linkedBooking.tripId) })
      }

      toast({
        title: 'Activity unlinked',
        description: 'This activity is no longer part of the package.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlink activity from package.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    }
  }

  // Form submission handler
  const onSubmit = handleSubmit(
    async (data) => {
      // Success - force save
      setSaveStatus('saving')
      try {
        const response = await saveFn(data)

        if (!activityId && response.id) {
          setActivityId(response.id)
        }
        if (response.activityPricingId) {
          setActivityPricingId(response.activityPricingId)
        }

        reset(getValues(), { keepDirty: false })
        lastSavedSnapshotRef.current = JSON.stringify(getValues())
        setSaveStatus('saved')
        setLastSavedAt(new Date())

        // Show success overlay and redirect
        setShowSuccess(true)
      } catch (err: any) {
        setSaveStatus('error')
        if (err.fieldErrors) {
          mapServerErrors(err.fieldErrors, setError, LODGING_FORM_FIELDS)
        }
        toast({
          title: 'Save failed',
          description: err.message || 'Please check the form for errors.',
          variant: 'destructive',
        })
      }
    },
    (fieldErrors) => {
      // Validation failed - scroll to first error
      scrollToFirstError(fieldErrors as Record<string, unknown>)
      const firstError = getFirstError(fieldErrors as Record<string, unknown>)
      toast({
        title: 'Validation Error',
        description: firstError
          ? `${formatFieldLabel(firstError.field)}: ${firstError.message}`
          : 'Please fix the highlighted errors before saving.',
        variant: 'destructive',
      })
    }
  )

  // Get travelers from trip data
  const travelers = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  // Helper to show field errors
  const FieldError = ({ path }: { path: string }) => {
    const message = getErrorMessage(errors as Record<string, unknown>, path)
    if (!message) return null
    return <p className="text-sm text-red-600 mt-1">{message}</p>
  }

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Lodging Updated!' : 'Lodging Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Lodging Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-emerald-500 rounded-lg flex items-center justify-center">
          <Building2 className="h-8 w-8 text-white" />
        </div>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl font-semibold mb-3 ${displayName ? 'text-gray-900' : 'text-gray-400'}`}>
            {displayName || placeholder}
          </h1>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Travelers */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Travelers ({travelers.length} of {totalTravelers})</span>
              <div className="flex -space-x-2">
                {travelers.map((traveler: any) => (
                  <Avatar key={traveler.id} className="w-8 h-8 border-2 border-white">
                    <AvatarFallback className="bg-emerald-500 text-white text-xs">
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
                onValueChange={(v) => setValue('status', v as 'proposed' | 'confirmed' | 'cancelled', { shouldDirty: true })}
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

        {/* Auto-Save Status Indicator */}
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
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger
            value="general"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            General Info
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="booking"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Booking & Pricing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          {/* Package Info Banner - shown when activity is linked to a package */}
          {activity?.packageId && linkedBooking && (
            <Alert
              className="mb-6 bg-teal-50 border-teal-200"
              role="status"
              aria-live="polite"
            >
              <Package className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <AlertDescription className="flex items-center justify-between ml-2">
                <span className="text-teal-800">
                  This activity&apos;s pricing is managed by package:{' '}
                  {tripId ? (
                    <Link
                      href={`/trips/${tripId}/activities/${activity.packageId}/edit?type=package`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {linkedBooking.name || 'Unnamed Package'}
                    </Link>
                  ) : (
                    <span className="font-medium">{linkedBooking.name || 'Unnamed Package'}</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkFromPackage}
                  disabled={unlinkMutation.isPending}
                  className="text-teal-700 hover:text-teal-900 hover:bg-teal-100"
                  aria-label={`Unlink activity from package ${linkedBooking.name || 'Unnamed Package'}`}
                >
                  {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Package Deleted Banner - shown if bookingId exists but fetch failed */}
          {packageDeleted && (
            <Alert
              className="mb-6 bg-amber-50 border-amber-200"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertDescription className="flex items-center justify-between ml-2">
                <span className="text-amber-800">
                  This activity was linked to a package that has been deleted.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkFromPackage}
                  disabled={unlinkMutation.isPending}
                  className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                  aria-label="Clear orphaned package link"
                >
                  {unlinkMutation.isPending ? 'Clearing...' : 'Clear Link'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

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
                  Paste hotel confirmation details or describe the accommodation, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste hotel confirmation or describe the lodging..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAiSubmit} className="bg-emerald-600 hover:bg-emerald-700">
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Property Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Property Information</h3>

            {/* Hotel Search Panel */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Search Hotel (Auto-fill)</label>
              <HotelSearchPanel
                onSelect={handleHotelSelect}
                checkIn={dateToString(checkInDateValue) ?? undefined}
                checkOut={dateToString(checkOutDateValue) ?? undefined}
                adults={totalTravelers || undefined}
                className="max-w-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Property Name *</label>
                <Input
                  {...register('lodgingDetails.propertyName')}
                  data-field="lodgingDetails.propertyName"
                  placeholder="e.g., Grand Hotel Paris"
                  className={errors.lodgingDetails?.propertyName ? 'border-red-500' : ''}
                />
                <FieldError path="lodgingDetails.propertyName" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Confirmation Number</label>
                <Input
                  {...register('confirmationNumber')}
                  data-field="confirmationNumber"
                  placeholder="Booking reference"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Textarea
                {...register('lodgingDetails.address')}
                data-field="lodgingDetails.address"
                placeholder="Full property address"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  {...register('lodgingDetails.phone')}
                  data-field="lodgingDetails.phone"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Website</label>
                <Input
                  {...register('lodgingDetails.website')}
                  data-field="lodgingDetails.website"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Check-in/out Details */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Check-in / Check-out</h3>

            <div className="grid grid-cols-2 gap-6">
              {/* Check-in */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">Check-in</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Date *</label>
                    <DatePickerEnhanced
                      value={dateToString(checkInDateValue)}
                      onChange={(dateStr) => setValue('lodgingDetails.checkInDate', stringToDate(dateStr) || new Date(), { shouldDirty: true })}
                      placeholder="YYYY-MM-DD"
                      data-field="lodgingDetails.checkInDate"
                      defaultMonthHint={tripMonthHint}
                    />
                    <TripDateWarning
                      date={dateToString(checkInDateValue)}
                      tripStartDate={trip?.startDate}
                      tripEndDate={trip?.endDate}
                      fieldLabel="Check-in"
                    />
                    <FieldError path="lodgingDetails.checkInDate" />
                    {/* Day assignment feedback for pendingDay mode */}
                    {pendingDay && (
                      <>
                        {checkInDateValue && matchedDay ? (
                          <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            This lodging will be added to <strong>Day {matchedDay.dayNumber}</strong>
                          </p>
                        ) : checkInDateValue && !matchedDay ? (
                          <p className="text-sm text-amber-600 flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4" />
                            No matching day found for this date
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Time</label>
                    <TimePicker
                      value={checkInTimeValue || null}
                      onChange={(v) => setValue('lodgingDetails.checkInTime', v ?? '', { shouldDirty: true })}
                      placeholder="HH:MM"
                      data-field="lodgingDetails.checkInTime"
                    />
                  </div>
                </div>
              </div>

              {/* Check-out */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">Check-out</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Date *</label>
                    <DatePickerEnhanced
                      value={dateToString(checkOutDateValue)}
                      onChange={(dateStr) => setValue('lodgingDetails.checkOutDate', stringToDate(dateStr) || new Date(), { shouldDirty: true })}
                      placeholder="YYYY-MM-DD"
                      data-field="lodgingDetails.checkOutDate"
                      defaultMonthHint={tripMonthHint}
                    />
                    <TripDateWarning
                      date={dateToString(checkOutDateValue)}
                      tripStartDate={trip?.startDate}
                      tripEndDate={trip?.endDate}
                      fieldLabel="Check-out"
                    />
                    <FieldError path="lodgingDetails.checkOutDate" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Time</label>
                    <TimePicker
                      value={checkOutTimeValue || null}
                      onChange={(v) => setValue('lodgingDetails.checkOutTime', v ?? '', { shouldDirty: true })}
                      placeholder="HH:MM"
                      data-field="lodgingDetails.checkOutTime"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Timezone</label>
              <Select
                value={timezoneValue || ''}
                onValueChange={(v) => setValue('lodgingDetails.timezone', v, { shouldDirty: true })}
              >
                <SelectTrigger className="w-full max-w-xs" data-field="lodgingDetails.timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room Details */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Room Details</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Room Type</label>
                <Select
                  value={roomTypeValue || 'standard'}
                  onValueChange={(v) => setValue('lodgingDetails.roomType', v, { shouldDirty: true })}
                >
                  <SelectTrigger data-field="lodgingDetails.roomType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Number of Rooms</label>
                <Input
                  type="number"
                  min={1}
                  value={roomCountValue || 1}
                  onChange={(e) => setValue('lodgingDetails.roomCount', parseInt(e.target.value) || 1, { shouldDirty: true })}
                  data-field="lodgingDetails.roomCount"
                />
              </div>
            </div>
          </div>

          {/* Amenities */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Amenities</h3>
            <p className="text-sm text-gray-600">Select amenities included with this accommodation</p>

            <AmenitiesSelector
              amenitiesGrouped={amenitiesGrouped}
              selectedAmenities={amenitiesValue || []}
              onToggle={toggleAmenity}
              isLoading={amenitiesLoading}
            />
          </div>

          {/* Special Requests */}
          <div className="space-y-2 pt-4 border-t">
            <label className="text-sm font-medium text-gray-700">Special Requests</label>
            <Textarea
              {...register('lodgingDetails.specialRequests')}
              data-field="lodgingDetails.specialRequests"
              placeholder="Early check-in, late check-out, dietary requirements, accessibility needs..."
              className="min-h-[100px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              {...register('description')}
              data-field="description"
              placeholder="Add a description for this accommodation..."
              className="min-h-[100px]"
            />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="accommodation"
              itineraryId={itineraryId}
              title="Accommodation Photos"
              description="Room photos, property images, and amenity pictures"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the lodging first to upload media.</p>
              <p className="text-sm mt-1">Media will be available after the lodging is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the lodging first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the lodging is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="booking" className="mt-6 space-y-6">
          {/* Booking Status Section */}
          {isChildOfPackage && parentPackageId ? (
            <ChildOfPackageBookingSection
              parentPackageId={parentPackageId}
              parentPackageName={parentPackageName}
              tripId={trip?.id || ''}
              activityIsBooked={activityIsBooked}
              activityBookingDate={activityBookingDate}
            />
          ) : activityId ? (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarCheck className="h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Booking Status</h3>
                    <p className="text-xs text-gray-500">
                      Mark this lodging as booked when it&apos;s been confirmed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <BookingStatusBadge
                    isBooked={activityIsBooked}
                    bookingDate={activityBookingDate}
                    onClick={() => setShowBookingModal(true)}
                  />
                  <Button
                    type="button"
                    variant={activityIsBooked ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => setShowBookingModal(true)}
                    className={activityIsBooked ? '' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {activityIsBooked ? 'Update Booking' : 'Mark as Booked'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <Separator />

          {/* Pricing Section */}
          <PricingSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={pricingValidationErrors}
            packageId={selectedPackageId}
            packages={availablePackages}
            tripId={tripId}
            onPackageChange={setSelectedPackageId}
            isChildOfPackage={isChildOfPackage}
            parentPackageName={parentPackageName}
            travelers={travelers}
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

          <Separator />

          {/* Booking Details */}
          <BookingDetailsSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            onSupplierDefaultsApplied={handleSupplierDefaultsApplied}
          />

          <Separator />

          {/* Commission Section */}
          <CommissionSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={pricingValidationErrors}
            isChildOfPackage={isChildOfPackage}
            parentPackageName={parentPackageName}
            supplierCommissionRate={supplierCommissionRate}
            userSplitValue={userProfile?.commissionSettings?.splitValue}
            userSplitType={userProfile?.commissionSettings?.splitType}
          />
        </TabsContent>
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} className="bg-emerald-600 hover:bg-emerald-700">
          {isEditing ? 'Save Changes' : 'Create Lodging'}
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

      {/* Mark as Booked Modal */}
      <MarkActivityBookedModal
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
        activityName={propertyNameValue || 'Lodging'}
        isBooked={activityIsBooked}
        currentBookingDate={activityBookingDate}
        onConfirm={handleMarkAsBooked}
        isPending={markActivityBooked.isPending}
      />
    </div>
  )
}
