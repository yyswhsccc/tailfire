'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type {
  ActivityResponseDto,
  UpdateTransportationActivityDto,
  TransportationSubtype,
  ItineraryDayWithActivitiesDto,
  NormalizedTransferResult,
} from '@tailfire/shared-types/api'
import { TransferSearchPanel } from '@/components/transfer-search-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Car,
  User,
  Phone,
  Mail,
  MapPin,
  Plane,
  ArrowRightLeft,
  FileText,
  DollarSign,
  ImageIcon,
  Globe,
  Key,
  Loader2,
  Check,
  AlertCircle,
  CalendarCheck,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import {
  useTransportation,
  useCreateTransportation,
  useUpdateTransportation,
} from '@/hooks/use-transportation'
import { useMarkActivityBooked } from '@/hooks/use-activity-bookings'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { useBookings } from '@/hooks/use-bookings'
import { MarkActivityBookedModal, BookingStatusBadge } from '@/components/activities/mark-activity-booked-modal'
import { ChildOfPackageBookingSection } from '@/components/activities/child-of-package-booking-section'
import { useToast } from '@/hooks/use-toast'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { PaymentScheduleSection } from './payment-schedule-section'
import { type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { Separator } from '@/components/ui/separator'
import {
  transportationFormSchema,
  toTransportationDefaults,
  toTransportationApiPayload,
  TRANSPORTATION_FORM_FIELDS,
  type TransportationFormData,
} from '@/lib/validation/transportation-validation'
import { mapServerErrors, scrollToFirstError, getErrorMessage, getFirstError, formatFieldLabel } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'
import type { CascadePreview } from '@tailfire/shared-types/api'
import { useCascadePreview, useCascadeApply } from '@/hooks/use-itinerary-days'
import { CascadeConfirmationDialog } from '@/components/cascade-confirmation-dialog'

// Transportation subtype options
const TRANSPORTATION_SUBTYPES: { value: TransportationSubtype; label: string }[] = [
  { value: 'transfer', label: 'Airport/Hotel Transfer' },
  { value: 'car_rental', label: 'Car Rental' },
  { value: 'private_car', label: 'Private Car Service' },
  { value: 'taxi', label: 'Taxi/Rideshare' },
  { value: 'shuttle', label: 'Shuttle Service' },
  { value: 'train', label: 'Train/Rail' },
  { value: 'ferry', label: 'Ferry/Water Transport' },
  { value: 'bus', label: 'Bus/Coach' },
  { value: 'limousine', label: 'Limousine' },
]

// Vehicle type options
const VEHICLE_TYPES = [
  { value: 'car', label: 'Car' },
  { value: 'suv', label: 'SUV' },
  { value: 'van', label: 'Van' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'bus', label: 'Bus' },
  { value: 'coach', label: 'Coach' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'luxury', label: 'Luxury Vehicle' },
  { value: 'train_car', label: 'Train Car' },
  { value: 'ferry', label: 'Ferry' },
]

// Common vehicle features
const VEHICLE_FEATURES = [
  'WiFi',
  'Air Conditioning',
  'GPS Navigation',
  'Child Seat',
  'Wheelchair Accessible',
  'Luggage Space',
  'Bluetooth',
  'USB Charging',
  'Leather Seats',
  'Tinted Windows',
  'Meet & Greet',
  'Flight Tracking',
]

// Auto-save watched fields (trigger save when these change)
const AUTO_SAVE_FIELDS = [
  'name',
  'description',
  'status',
  'notes',
  'confirmationNumber',
  'transportationDetails.subtype',
  'transportationDetails.providerName',
  'transportationDetails.providerPhone',
  'transportationDetails.providerEmail',
  'transportationDetails.vehicleType',
  'transportationDetails.vehicleModel',
  'transportationDetails.vehicleCapacity',
  'transportationDetails.licensePlate',
  'transportationDetails.pickupDate',
  'transportationDetails.pickupTime',
  'transportationDetails.pickupTimezone',
  'transportationDetails.pickupAddress',
  'transportationDetails.pickupNotes',
  'transportationDetails.dropoffDate',
  'transportationDetails.dropoffTime',
  'transportationDetails.dropoffTimezone',
  'transportationDetails.dropoffAddress',
  'transportationDetails.dropoffNotes',
  'transportationDetails.driverName',
  'transportationDetails.driverPhone',
  'transportationDetails.rentalPickupLocation',
  'transportationDetails.rentalDropoffLocation',
  'transportationDetails.rentalInsuranceType',
  'transportationDetails.rentalMileageLimit',
  'transportationDetails.features',
  'transportationDetails.specialRequests',
  'transportationDetails.flightNumber',
  'transportationDetails.isRoundTrip',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
  'termsAndConditions',
  'cancellationPolicy',
  'supplier',
] as const

interface TransportationFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  trip?: any
  onSuccess?: () => void
  onCancel?: () => void
  /** When true, user must select a date to determine which day to assign activity to */
  pendingDay?: boolean
  /** Available itinerary days (required when pendingDay is true) */
  days?: ItineraryDayWithActivitiesDto[]
}

export function TransportationForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: TransportationFormProps) {
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

  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'booking' ? 'pricing' : 'general'
  })

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)

  // Safety net refs to prevent duplicate creation race condition
  const activityIdRef = useRef<string | null>(activity?.id || null)
  const createInProgressRef = useRef(false)

  // Activity pricing ID (gated on this for payment schedule)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // Booking status state
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const { returnToItinerary } = useActivityNavigation()
  const [activityIsBooked, setActivityIsBooked] = useState(activity?.isBooked ?? false)
  const [activityBookingDate, setActivityBookingDate] = useState<string | null>(activity?.bookingDate ?? null)

  // Cascade state
  const [cascadePreview, setCascadePreview] = useState<CascadePreview | null>(null)
  const [showCascadeDialog, setShowCascadeDialog] = useState(false)
  const cascadePreviewMutation = useCascadePreview(itineraryId)
  const cascadeApplyMutation = useCascadeApply(itineraryId)

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

  // Fetch user profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Auto-save status tracking (with date validation)
  const { saveStatus, setSaveStatus, lastSavedAt, setLastSavedAt } = useSaveStatus({
    activityId: activity?.id,
    updatedAt: activity?.updatedAt,
  })
  const failureToastShown = useRef(false)
  const lastSavedSnapshotRef = useRef<string | null>(null)

  // Fetch full transportation data if editing
  const { data: transportationData } = useTransportation(activityId || '')

  // Initialize form with RHF + Zod
  const form = useForm<TransportationFormData>({
    resolver: zodResolver(transportationFormSchema),
    defaultValues: toTransportationDefaults(
      { itineraryDayId: dayId },
      dayDate,
      trip?.currency
    ),
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

  // Watch specific fields for auto-save
  const watchedFields = useWatch({
    control,
    name: AUTO_SAVE_FIELDS as unknown as (keyof TransportationFormData)[],
  })

  // Watch subtype for conditional rendering
  const subtype = useWatch({ control, name: 'transportationDetails.subtype' })

  // useWatch for custom components (Selects, DatePickers, TimePickers, Switch, number inputs)
  const vehicleTypeValue = useWatch({ control, name: 'transportationDetails.vehicleType' })
  const vehicleCapacityValue = useWatch({ control, name: 'transportationDetails.vehicleCapacity' })
  const pickupDateValue = useWatch({ control, name: 'transportationDetails.pickupDate' })
  const pickupTimeValue = useWatch({ control, name: 'transportationDetails.pickupTime' })
  const dropoffDateValue = useWatch({ control, name: 'transportationDetails.dropoffDate' })
  const dropoffTimeValue = useWatch({ control, name: 'transportationDetails.dropoffTime' })
  const isRoundTripValue = useWatch({ control, name: 'transportationDetails.isRoundTrip' })
  const pickupAddressValue = useWatch({ control, name: 'transportationDetails.pickupAddress' })
  const dropoffAddressValue = useWatch({ control, name: 'transportationDetails.dropoffAddress' })

  // Transfer search panel state
  const [showTransferSearch, setShowTransferSearch] = useState(false)

  const handleTransferSelect = (transfer: NormalizedTransferResult) => {
    setValue('transportationDetails.providerName', transfer.provider || '', { shouldDirty: true })
    setValue('transportationDetails.vehicleType', transfer.vehicle.type?.toLowerCase() || '', { shouldDirty: true })
    if (transfer.vehicle.maxPassengers) {
      setValue('transportationDetails.vehicleCapacity', transfer.vehicle.maxPassengers, { shouldDirty: true })
    }
    if (transfer.pickupLocation?.address) {
      setValue('transportationDetails.pickupAddress', transfer.pickupLocation.address, { shouldDirty: true })
    }
    if (transfer.dropoffLocation?.address) {
      setValue('transportationDetails.dropoffAddress', transfer.dropoffLocation.address, { shouldDirty: true })
    }
    // Populate pricing
    if (transfer.price?.total) {
      const totalCents = Math.round(parseFloat(transfer.price.total) * 100)
      setValue('totalPriceCents', totalCents, { shouldDirty: true })
    }
    if (transfer.price?.currency) {
      setValue('currency', transfer.price.currency, { shouldDirty: true })
    }
    if (transfer.cancellationPolicy) {
      const policyText = transfer.cancellationPolicy.refundable ? 'Free cancellation' : `Non-refundable. ${transfer.cancellationPolicy.description || ''}`
      setValue('cancellationPolicy', policyText, { shouldDirty: true })
    }
    // Populate description with vehicle details and duration
    const descParts = [transfer.vehicle.description]
    if (transfer.duration) descParts.push(`Duration: ${transfer.duration.replace('PT', '').toLowerCase()}`)
    if (transfer.vehicle.maxBags) descParts.push(`Max bags: ${transfer.vehicle.maxBags}`)
    setValue('description', descParts.filter(Boolean).join(' | '), { shouldDirty: true })

    setShowTransferSearch(false)
    toast({
      title: 'Transfer Details Applied',
      description: `${transfer.vehicle.type} - ${transfer.price.currency} ${transfer.price.total}`,
    })
  }

  // Auto-generate activity name from pickup/dropoff addresses
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'transportation',
    control,
    setValue,
    origin: pickupAddressValue || undefined,
    destination: dropoffAddressValue || undefined,
  })

  // Trip month hint for date pickers (opens calendar to trip's month)
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Derive dayId from pickup date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, pickupDateValue)
  const effectiveDayId = pendingDay ? (computedDayId || '') : dayId

  // In pendingDay mode, sync computed dayId to form field so validation passes
  useEffect(() => {
    if (pendingDay && computedDayId) {
      setValue('itineraryDayId', computedDayId, { shouldDirty: false })
    }
  }, [pendingDay, computedDayId, setValue])

  // Track if dayDate has been auto-applied (prevents duplicate application)
  const dayDateAppliedRef = useRef(false)

  // Reset the ref when dayId changes (handles navigation between different days)
  useEffect(() => {
    dayDateAppliedRef.current = false
  }, [dayId])

  // Auto-populate pickup date from day context (only for new activities)
  // Uses watched pickupDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!pickupDateValue) {
      dayDateAppliedRef.current = true
      setValue('transportationDetails.pickupDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, pickupDateValue, setValue])

  // Mutations - use effectiveDayId to support pendingDay mode
  const createMutation = useCreateTransportation(itineraryId, effectiveDayId)
  const updateMutation = useUpdateTransportation(itineraryId, effectiveDayId)

  // Booking status mutation
  const markActivityBooked = useMarkActivityBooked()

  // Handler for marking transportation as booked
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

  // Build pricingData for pricing sections (uses watchedFields to refresh)
  const pricingData: PricingData = useMemo(() => {
    void watchedFields
    const values = getValues()
    return {
      // Derive invoiceType from package linkage
      invoiceType: selectedPackageId ? 'part_of_package' : 'individual_item',
      pricingType: (values.pricingType || 'flat_rate') as PricingData['pricingType'],
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

  const travelers: Array<{ id: string; name: string }> = trip?.travelers || []

  // Handler for pricing/booking/commission section updates
  const handlePricingUpdate = useCallback((updates: Partial<PricingData>) => {
    if ('pricingBreakdown' in updates) {
      setPricingBreakdown(updates.pricingBreakdown ?? null)
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'pricingBreakdown') return
      setValue(key as keyof TransportationFormData, value as any, { shouldDirty: true, shouldValidate: true })
    })
  }, [setValue])

  // Handle supplier defaults from BookingDetailsSection
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  // Ref to track loaded transportation ID (prevents re-seeding on every render)
  const transportationIdRef = useRef<string | null>(null)

  // Smart re-seeding: only when transportation ID actually changes
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (transportationData && transportationData.id !== transportationIdRef.current) {
      transportationIdRef.current = transportationData.id

      setActivityId(transportationData.id)
      setActivityPricingId(transportationData.activityPricingId || null)

      // Seed form from loaded transportation
      const serverData = {
        itineraryDayId: dayId,
        componentType: 'transportation' as const,
        name: transportationData.name,
        description: transportationData.description || '',
        status: transportationData.status as 'proposed' | 'confirmed' | 'cancelled' | 'pending',
        notes: transportationData.notes || '',
        confirmationNumber: transportationData.confirmationNumber || '',
        transportationDetails: transportationData.transportationDetails,
        totalPriceCents: transportationData.totalPriceCents,
        taxesAndFeesCents: transportationData.taxesAndFeesCents,
        currency: transportationData.currency || trip?.currency || 'CAD',
        pricingType: (transportationData.pricingType || 'flat_rate') as TransportationFormData['pricingType'],
        // Commission fields
        commissionTotalCents: transportationData.commissionTotalCents,
        commissionSplitPercentage: transportationData.commissionSplitPercentage
          ? parseFloat(transportationData.commissionSplitPercentage)
          : null,
        commissionExpectedDate: transportationData.commissionExpectedDate || null,
        // Booking details
        termsAndConditions: transportationData.termsAndConditions || '',
        cancellationPolicy: transportationData.cancellationPolicy || '',
        supplier: transportationData.supplier || '',
      }

      const defaults = toTransportationDefaults(serverData as any, dayDate, trip?.currency)

      // Use queueMicrotask to defer form reset outside React's render cycle
      queueMicrotask(() => {
        if (!cancelled) {
          reset(defaults, { keepDirty: false })
          // Update snapshot to prevent immediate re-save
          lastSavedSnapshotRef.current = JSON.stringify(getValues())
        }
      })
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [transportationData, dayId, trip?.currency, dayDate, getValues, reset])

  // Save function (create vs update)
  const saveFn = useCallback(
    async (data: TransportationFormData) => {
      // Convert form data to API payload with proper type conversions
      const formData = toTransportationApiPayload(data)
      const payload = { ...formData, pricingBreakdownJson: pricingBreakdown }

      if (activityId) {
        return updateMutation.mutateAsync({
          id: activityId,
          data: payload as UpdateTransportationActivityDto,
        })
      } else {
        return createMutation.mutateAsync(payload)
      }
    },
    [activityId, createMutation, updateMutation, pricingBreakdown]
  )

  // Auto-save effect with proper gating
  useEffect(() => {
    // Gate conditions per plan spec
    if (!isDirty || !isValid || isValidating || isSubmitting) {
      return
    }
    if (createMutation.isPending || updateMutation.isPending) {
      return
    }
    if (!dayId) {
      return
    }

    // Compare against last saved snapshot
    const currentSnapshot = JSON.stringify(getValues())
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return
    }

    const timer = setTimeout(async () => {
      // SAFETY NET: Check refs to prevent duplicate creation race condition
      if (createInProgressRef.current) {
        return
      }

      setSaveStatus('saving')

      try {
        // Check if we're creating (no activity yet)
        const isCreating = !activityId && !activityIdRef.current
        if (isCreating) {
          createInProgressRef.current = true
        }

        let response
        try {
          response = await saveFn(getValues())
        } finally {
          if (isCreating) {
            createInProgressRef.current = false
          }
        }

        // Update activity ID on create
        if (response.id && !activityIdRef.current) {
          // Update ref immediately (synchronous) before React state update
          activityIdRef.current = response.id
          setActivityId(response.id)
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
          mapServerErrors(err.fieldErrors, setError, TRANSPORTATION_FORM_FIELDS)
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
    createMutation.isPending,
    updateMutation.isPending,
    dayId,
    activityId,
    getValues,
    saveFn,
    reset,
    setError,
    setLastSavedAt,
    setSaveStatus,
    toast,
  ])

  // Toggle feature
  const toggleFeature = (feature: string) => {
    const currentFeatures = getValues('transportationDetails.features') || []
    const newFeatures = currentFeatures.includes(feature)
      ? currentFeatures.filter((f) => f !== feature)
      : [...currentFeatures, feature]
    setValue('transportationDetails.features', newFeatures, { shouldDirty: true })
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

        reset(getValues(), { keepDirty: false })
        lastSavedSnapshotRef.current = JSON.stringify(getValues())
        setSaveStatus('saved')
        setLastSavedAt(new Date())

        // Check for cascade: transfers with dropoff address
        const subtype = data.transportationDetails?.subtype
        const dropoffAddress = data.transportationDetails?.dropoffAddress
        const savedActivityId = response.id || activityId
        const isTransferType = subtype === 'transfer' || subtype === 'private_car' || subtype === 'shuttle'

        if (isTransferType && dropoffAddress && savedActivityId) {
          try {
            const preview = await cascadePreviewMutation.mutateAsync({
              dayId,
              request: {
                location: { name: dropoffAddress, lat: 0, lng: 0 },
                activityId: savedActivityId,
                activityType: 'transportation',
                description: `Transfer arrives at ${dropoffAddress}`,
              },
            })

            if (preview.affectedDays.length > 0) {
              setCascadePreview(preview)
              setShowCascadeDialog(true)
              return
            }
          } catch {
            // Non-blocking
          }
        }

        // Show success overlay and redirect
        setShowSuccess(true)
      } catch (err: any) {
        setSaveStatus('error')
        if (err.fieldErrors) {
          mapServerErrors(err.fieldErrors, setError, TRANSPORTATION_FORM_FIELDS)
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

  // Helper to show field errors
  const FieldError = ({ path }: { path: string }) => {
    const message = getErrorMessage(errors as Record<string, unknown>, path)
    if (!message) return null
    return <p className="text-sm text-red-600 mt-1">{message}</p>
  }

  return (
    <div className="relative space-y-6">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Transportation Updated!' : 'Transportation Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${displayName ? 'text-gray-900' : 'text-gray-400'}`}>
            {displayName || placeholder}
          </h2>
          <p className="text-muted-foreground">
            {isEditing ? 'Update transportation details' : 'Add a new transportation to your itinerary'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-Save Status Indicator */}
          <div className="flex items-center gap-2 text-sm mr-4">
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
                <span className="text-red-600">Error</span>
              </>
            )}
          </div>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={onSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Create Transportation'}
          </Button>
        </div>
      </div>

      {/* Name input */}
      <div className="space-y-2">
        <Label htmlFor="name">Transportation Name *</Label>
        <Input
          {...register('name')}
          id="name"
          data-field="name"
          placeholder="e.g., Airport Transfer, Car Rental"
          className={errors.name ? 'border-red-500' : ''}
        />
        <FieldError path="name" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Car className="h-4 w-4" />
            General
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
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6 mt-6">
          {/* Transportation Type & Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="h-5 w-5 text-purple-500" />
                Transportation Type & Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transportation Type</Label>
                  <Select
                    value={subtype || ''}
                    onValueChange={(v) => setValue('transportationDetails.subtype', (v || null) as TransportationSubtype | null, { shouldDirty: true })}
                  >
                    <SelectTrigger data-field="transportationDetails.subtype">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORTATION_SUBTYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Provider Name</Label>
                  <Input
                    {...register('transportationDetails.providerName')}
                    data-field="transportationDetails.providerName"
                    placeholder="e.g., Hertz, Uber, SuperShuttle"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...register('transportationDetails.providerPhone')}
                      className="pl-10"
                      data-field="transportationDetails.providerPhone"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...register('transportationDetails.providerEmail')}
                      className="pl-10"
                      type="email"
                      data-field="transportationDetails.providerEmail"
                      placeholder="service@provider.com"
                    />
                  </div>
                  <FieldError path="transportationDetails.providerEmail" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Transfers (only for transfer subtype) */}
          {subtype === 'transfer' && (
            <div className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => setShowTransferSearch(!showTransferSearch)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium">Search Transfers</span>
                  <span className="text-xs text-gray-400 ml-1">External providers</span>
                </div>
                {showTransferSearch ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {showTransferSearch && (
                <div className="p-4 border-t border-gray-200">
                  <TransferSearchPanel
                    onSelect={handleTransferSelect}
                    defaultPickupAddress={pickupAddressValue || ''}
                    defaultDropoffAddress={dropoffAddressValue || ''}
                    defaultDate={pickupDateValue || ''}
                    defaultTime={pickupTimeValue || ''}
                  />
                </div>
              )}
            </div>
          )}

          {/* Vehicle Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="h-5 w-5 text-purple-500" />
                Vehicle Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Type</Label>
                <Select
                  value={vehicleTypeValue || ''}
                  onValueChange={(v) => setValue('transportationDetails.vehicleType', v || '', { shouldDirty: true })}
                >
                  <SelectTrigger data-field="transportationDetails.vehicleType">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vehicle Model</Label>
                <Input
                  {...register('transportationDetails.vehicleModel')}
                  data-field="transportationDetails.vehicleModel"
                  placeholder="e.g., Toyota Camry"
                />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={vehicleCapacityValue ?? ''}
                  onChange={(e) => setValue('transportationDetails.vehicleCapacity', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                  data-field="transportationDetails.vehicleCapacity"
                  placeholder="Passengers"
                />
              </div>
              <div className="space-y-2">
                <Label>License Plate</Label>
                <Input
                  {...register('transportationDetails.licensePlate')}
                  data-field="transportationDetails.licensePlate"
                  placeholder="ABC 1234"
                />
              </div>
            </CardContent>
          </Card>

          {/* Pickup Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-green-500" />
                Pickup Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Pickup Date</Label>
                  <DatePickerEnhanced
                    value={pickupDateValue || null}
                    onChange={(date) => setValue('transportationDetails.pickupDate', date ?? null, { shouldDirty: true })}
                    placeholder="YYYY-MM-DD"
                    data-field="transportationDetails.pickupDate"
                    defaultMonthHint={tripMonthHint}
                  />
                  <TripDateWarning
                    date={pickupDateValue}
                    tripStartDate={trip?.startDate}
                    tripEndDate={trip?.endDate}
                    fieldLabel="Pickup date"
                  />
                  {/* Day assignment feedback for pendingDay mode */}
                  {pendingDay && (
                    <div className="mt-2">
                      {pickupDateValue && matchedDay ? (
                        <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                          <Check className="h-4 w-4" />
                          This transport will be added to <strong>Day {matchedDay.dayNumber}</strong>
                        </p>
                      ) : pickupDateValue && !matchedDay ? (
                        <p className="text-sm text-amber-600 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4" />
                          No matching day found for this date
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Pickup Time</Label>
                  <TimePicker
                    value={pickupTimeValue || null}
                    onChange={(time) => setValue('transportationDetails.pickupTime', time ?? '', { shouldDirty: true })}
                    placeholder="HH:MM"
                    data-field="transportationDetails.pickupTime"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...register('transportationDetails.pickupTimezone')}
                      className="pl-10"
                      data-field="transportationDetails.pickupTimezone"
                      placeholder="America/New_York"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Flight Number</Label>
                  <div className="relative">
                    <Plane className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...register('transportationDetails.flightNumber')}
                      className="pl-10"
                      data-field="transportationDetails.flightNumber"
                      placeholder="AA123"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Pickup Address</Label>
                <Input
                  {...register('transportationDetails.pickupAddress')}
                  data-field="transportationDetails.pickupAddress"
                  placeholder="Full pickup address"
                />
              </div>
              <div className="space-y-2">
                <Label>Pickup Notes</Label>
                <Textarea
                  {...register('transportationDetails.pickupNotes')}
                  data-field="transportationDetails.pickupNotes"
                  placeholder="Meeting point instructions, look for driver with sign, etc."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Dropoff Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-red-500" />
                Dropoff Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Dropoff Date</Label>
                  <DatePickerEnhanced
                    value={dropoffDateValue || null}
                    onChange={(date) => setValue('transportationDetails.dropoffDate', date ?? null, { shouldDirty: true })}
                    placeholder="YYYY-MM-DD"
                    data-field="transportationDetails.dropoffDate"
                    defaultMonthHint={tripMonthHint}
                  />
                  <TripDateWarning
                    date={dropoffDateValue}
                    tripStartDate={trip?.startDate}
                    tripEndDate={trip?.endDate}
                    fieldLabel="Dropoff date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dropoff Time</Label>
                  <TimePicker
                    value={dropoffTimeValue || null}
                    onChange={(time) => setValue('transportationDetails.dropoffTime', time ?? '', { shouldDirty: true })}
                    placeholder="HH:MM"
                    data-field="transportationDetails.dropoffTime"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...register('transportationDetails.dropoffTimezone')}
                      className="pl-10"
                      data-field="transportationDetails.dropoffTimezone"
                      placeholder="America/New_York"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dropoff Address</Label>
                <Input
                  {...register('transportationDetails.dropoffAddress')}
                  data-field="transportationDetails.dropoffAddress"
                  placeholder="Full dropoff address"
                />
              </div>
              <div className="space-y-2">
                <Label>Dropoff Notes</Label>
                <Textarea
                  {...register('transportationDetails.dropoffNotes')}
                  data-field="transportationDetails.dropoffNotes"
                  placeholder="Special dropoff instructions"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Car Rental Specific Fields - only show for car rentals */}
          {subtype === 'car_rental' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-orange-500" />
                  Car Rental Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pickup Location</Label>
                    <Input
                      {...register('transportationDetails.rentalPickupLocation')}
                      data-field="transportationDetails.rentalPickupLocation"
                      placeholder="e.g., LAX Airport - Terminal 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dropoff Location</Label>
                    <Input
                      {...register('transportationDetails.rentalDropoffLocation')}
                      data-field="transportationDetails.rentalDropoffLocation"
                      placeholder="e.g., Downtown LA Office"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Insurance Type</Label>
                    <Input
                      {...register('transportationDetails.rentalInsuranceType')}
                      data-field="transportationDetails.rentalInsuranceType"
                      placeholder="e.g., Full Coverage, Basic, CDW"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mileage Limit</Label>
                    <Input
                      {...register('transportationDetails.rentalMileageLimit')}
                      data-field="transportationDetails.rentalMileageLimit"
                      placeholder="e.g., Unlimited, 100 miles/day"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Driver Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-blue-500" />
                Driver Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Driver Name</Label>
                <Input
                  {...register('transportationDetails.driverName')}
                  data-field="transportationDetails.driverName"
                  placeholder="Driver's name"
                />
              </div>
              <div className="space-y-2">
                <Label>Driver Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    {...register('transportationDetails.driverPhone')}
                    className="pl-10"
                    data-field="transportationDetails.driverPhone"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Features & Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowRightLeft className="h-5 w-5 text-purple-500" />
                Features & Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="round-trip"
                  checked={isRoundTripValue || false}
                  onCheckedChange={(checked) => setValue('transportationDetails.isRoundTrip', checked, { shouldDirty: true })}
                />
                <Label htmlFor="round-trip">Round Trip</Label>
              </div>

              <div className="space-y-2">
                <Label>Vehicle Features</Label>
                <div className="flex flex-wrap gap-2">
                  {VEHICLE_FEATURES.map((feature) => {
                    const currentFeatures = getValues('transportationDetails.features') || []
                    const isSelected = currentFeatures.includes(feature)
                    return (
                      <Badge
                        key={feature}
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isSelected && 'bg-purple-500 hover:bg-purple-600'
                        )}
                        onClick={() => toggleFeature(feature)}
                      >
                        {feature}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Special Requests</Label>
                <Textarea
                  {...register('transportationDetails.specialRequests')}
                  data-field="transportationDetails.specialRequests"
                  placeholder="Any special requirements or requests..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                {...register('notes')}
                data-field="notes"
                placeholder="Any additional notes about this transportation..."
                rows={3}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="transfer"
              itineraryId={itineraryId}
              title="Transfer Photos"
              description="Vehicle photos, route maps, and transfer documentation"
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Save the transportation first to upload media.</p>
                  <p className="text-sm mt-1">Media will be available after the transportation is created.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Save the transportation first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the transportation is created.</p>
            </div>
          )}
        </TabsContent>

        {/* Booking & Pricing Tab */}
        <TabsContent value="pricing" className="mt-6 space-y-6">
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
                      Mark this transportation as booked when it&apos;s been confirmed
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

          {/* Payment Schedule */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Credit Card Authorization & Payment</h3>
            <PaymentScheduleSection
              activityPricingId={activityPricingId}
              totalPriceCents={pricingData.totalPriceCents}
              currency={pricingData.currency}
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
            errors={{}}
            isChildOfPackage={isChildOfPackage}
            parentPackageName={parentPackageName}
            supplierCommissionRate={supplierCommissionRate}
            userSplitValue={userProfile?.commissionSettings?.splitValue}
            userSplitType={userProfile?.commissionSettings?.splitType}
          />
        </TabsContent>
      </Tabs>

      {/* Mark As Booked Modal */}
      <MarkActivityBookedModal
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
        activityName="Transportation"
        isBooked={activityIsBooked}
        currentBookingDate={activityBookingDate}
        onConfirm={handleMarkAsBooked}
        isPending={markActivityBooked.isPending}
      />

      {/* Cascade Confirmation Dialog */}
      <CascadeConfirmationDialog
        preview={cascadePreview}
        open={showCascadeDialog}
        onOpenChange={setShowCascadeDialog}
        isApplying={cascadeApplyMutation.isPending}
        onConfirm={async (dayIds) => {
          if (!cascadePreview) return
          try {
            await cascadeApplyMutation.mutateAsync({
              dayId,
              confirmation: { dayIds },
              preview: cascadePreview,
            })
            toast({ title: 'Locations updated', description: `Applied to ${dayIds.length} days.` })
          } catch {
            toast({ title: 'Error', description: 'Failed to apply location updates.', variant: 'destructive' })
          }
          setShowCascadeDialog(false)
          setCascadePreview(null)
          setShowSuccess(true)
        }}
        onSkip={() => {
          setShowCascadeDialog(false)
          setCascadePreview(null)
          setShowSuccess(true)
        }}
      />
    </div>
  )
}
