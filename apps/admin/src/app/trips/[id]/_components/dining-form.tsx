'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UtensilsCrossed, ChevronDown, ChevronUp, Sparkles, Loader2, Check, AlertCircle, CalendarCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ActivityResponseDto, ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
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
import { useCreateDining, useUpdateDining, useDining } from '@/hooks/use-dining'
import { useMarkActivityBooked } from '@/hooks/use-activity-bookings'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { useBookings } from '@/hooks/use-bookings'
import { MarkActivityBookedModal, BookingStatusBadge } from '@/components/activities/mark-activity-booked-modal'
import { ChildOfPackageBookingSection } from '@/components/activities/child-of-package-booking-section'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { PaymentScheduleSection } from './payment-schedule-section'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { buildInitialPricingState, type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { Badge } from '@/components/ui/badge'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { ActivityCommentsPanel } from '@/components/activities/activity-comments-panel'
import {
  diningFormSchema,
  toDiningDefaults,
  toDiningApiPayload,
  type DiningFormData,
} from '@/lib/validation/dining-validation'
import { getErrorMessage, scrollToFirstError } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'

interface DiningFormProps {
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

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'afternoon_tea', label: 'Afternoon Tea' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late Night' },
] as const

const COMMON_DIETARY_REQUIREMENTS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Halal',
  'Kosher',
  'Pescatarian',
  'Low-Sodium',
  'Diabetic-Friendly',
]

export function DiningForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: DiningFormProps) {
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

  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [showTravelersDialog, setShowTravelersDialog] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'booking' ? 'booking' : 'general'
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

  // Auto-save state (with date validation)
  const {
    saveStatus: autoSaveStatus,
    setSaveStatus: setAutoSaveStatus,
    lastSavedAt,
    setLastSavedAt,
  } = useSaveStatus({
    activityId: activity?.id,
    updatedAt: activity?.updatedAt,
  })
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize react-hook-form with Zod validation
  const form = useForm<DiningFormData>({
    resolver: zodResolver(diningFormSchema),
    defaultValues: toDiningDefaults(null, dayDate, trip?.currency, trip?.travelers?.length || 2),
    mode: 'onSubmit', // Validate on submit to avoid render-time Controller issues
  })

  const {
    control,
    register,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty, isValid, isValidating, isSubmitting },
  } = form

  // useWatch for custom components (Selects, DatePicker, TimePicker, number inputs with null handling)
  const statusValue = useWatch({ control, name: 'status' })
  const mealTypeValue = useWatch({ control, name: 'diningDetails.mealType' })
  const reservationDateValue = useWatch({ control, name: 'diningDetails.reservationDate' })
  const reservationTimeValue = useWatch({ control, name: 'diningDetails.reservationTime' })
  const partySizeValue = useWatch({ control, name: 'diningDetails.partySize' })
  const timezoneValue = useWatch({ control, name: 'diningDetails.timezone' })
  const restaurantNameValue = useWatch({ control, name: 'diningDetails.restaurantName' })

  // Auto-generate activity name from restaurant name
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'dining',
    control,
    setValue,
    restaurantName: restaurantNameValue,
  })

  // Fetch dining data (for edit mode)
  const { data: diningData } = useDining(activityId || '')

  // Trip month hint for date pickers (opens calendar to trip's month)
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Derive dayId from reservation date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, reservationDateValue)
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

  // Auto-populate reservation date from day context (only for new activities)
  // Uses watched reservationDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!reservationDateValue) {
      dayDateAppliedRef.current = true
      setValue('diningDetails.reservationDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, reservationDateValue, setValue])

  // Mutations - use effectiveDayId to support pendingDay mode
  const createDining = useCreateDining(itineraryId, effectiveDayId)
  const updateDining = useUpdateDining(itineraryId, effectiveDayId)

  // Booking status mutation
  const markActivityBooked = useMarkActivityBooked()

  // Handler for marking dining as booked
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

  // Ref to track loaded dining ID (prevents re-seeding on every render)
  const diningIdRef = useRef<string | null>(null)

  // Smart re-seeding: only when dining ID actually changes
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (diningData && diningData.id !== diningIdRef.current) {
      diningIdRef.current = diningData.id

      setActivityId(diningData.id)
      setActivityPricingId(diningData.activityPricingId || null)

      // Build initial pricing state from server data
      const initialPricing = buildInitialPricingState(diningData as any)

      const defaults = toDiningDefaults({
        itineraryDayId: dayId,
        componentType: 'dining',
        name: diningData.name,
        description: diningData.description,
        status: diningData.status,
        totalPriceCents: initialPricing.totalPriceCents,
        taxesAndFeesCents: initialPricing.taxesAndFeesCents,
        currency: trip?.currency || initialPricing.currency,
        confirmationNumber: initialPricing.confirmationNumber,
        pricingType: diningData.pricingType || 'per_person',
        diningDetails: diningData.diningDetails || undefined,
        commissionTotalCents: initialPricing.commissionTotalCents,
        commissionSplitPercentage: initialPricing.commissionSplitPercentage,
        commissionExpectedDate: initialPricing.commissionExpectedDate,
        termsAndConditions: initialPricing.termsAndConditions,
        cancellationPolicy: initialPricing.cancellationPolicy,
        supplier: initialPricing.supplier,
      } as any, dayDate, trip?.currency, trip?.travelers?.length || 2)

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
  }, [diningData, dayId, trip?.currency, trip?.travelers?.length, dayDate, reset])

  // Watch all form values for auto-save
  const watchedValues = useWatch({ control })
  // Create stable string representation for dependency comparison
  // useWatch returns new object reference every render - JSON.stringify creates stable primitive
  const watchedValuesKey = useMemo(() => JSON.stringify(watchedValues), [watchedValues])

  // Auto-save effect with validation gating
  useEffect(() => {
    // Clear any pending timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Gate auto-save on validation state
    if (!isDirty || !isValid || isValidating || isSubmitting || createDining.isPending || updateDining.isPending) {
      return
    }

    // Debounce the save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      // SAFETY NET: Check refs to prevent duplicate creation race condition
      if (createInProgressRef.current) {
        return
      }

      setAutoSaveStatus('saving')
      try {
        const formData = getValues()
        const payload = toDiningApiPayload(formData)

        let response
        // Use ref for immediate check (state may be stale)
        if (activityId || activityIdRef.current) {
          const id = activityId || activityIdRef.current!
          response = await updateDining.mutateAsync({ id, data: payload })
        } else {
          // Mark create as in progress before API call
          createInProgressRef.current = true
          try {
            response = await createDining.mutateAsync(payload)
          } finally {
            createInProgressRef.current = false
          }
        }

        // Update activity ID on first save
        if (response.id && !activityIdRef.current) {
          // Update ref immediately (synchronous) before React state update
          activityIdRef.current = response.id
          setActivityId(response.id)
        }
        if (response.activityPricingId && response.activityPricingId !== activityPricingId) {
          setActivityPricingId(response.activityPricingId)
        }

        setAutoSaveStatus('saved')
        setLastSavedAt(new Date())
      } catch (err: any) {
        setAutoSaveStatus('error')
        toast({
          title: 'Auto-save failed',
          description: err.message,
          variant: 'destructive',
        })
      }
    }, 1000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [
    watchedValuesKey, // Use stable string instead of object reference
    isDirty,
    isValid,
    isValidating,
    isSubmitting,
    activityId,
    activityPricingId,
    getValues,
    createDining,
    updateDining,
    toast,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  // Force save handler
  const forceSave = useCallback(async () => {
    if (!isValid) {
      scrollToFirstError(errors)
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      return
    }

    setAutoSaveStatus('saving')
    try {
      const formData = getValues()
      const payload = { ...toDiningApiPayload(formData), pricingBreakdownJson: pricingBreakdown }

      let response
      if (activityId) {
        response = await updateDining.mutateAsync({ id: activityId, data: payload })
      } else {
        response = await createDining.mutateAsync(payload)
      }

      if (!activityId && response.id) {
        setActivityId(response.id)
      }
      if (response.activityPricingId && response.activityPricingId !== activityPricingId) {
        setActivityPricingId(response.activityPricingId)
      }

      setAutoSaveStatus('saved')
      setLastSavedAt(new Date())

      // Show success overlay and redirect
      setShowSuccess(true)
    } catch (err: any) {
      setAutoSaveStatus('error')
      toast({
        title: 'Save failed',
        description: err.message,
        variant: 'destructive',
      })
    }
  }, [
    isValid,
    errors,
    activityId,
    activityPricingId,
    pricingBreakdown,
    getValues,
    createDining,
    updateDining,
    toast,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing dining reservation details...',
    })
    setAiInput('')
  }

  const toggleDietaryRequirement = (requirement: string) => {
    const current = getValues('diningDetails.dietaryRequirements') || []
    const newRequirements = current.includes(requirement)
      ? current.filter(r => r !== requirement)
      : [...current, requirement]
    setValue('diningDetails.dietaryRequirements', newRequirements, { shouldDirty: true, shouldValidate: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await forceSave()
  }

  // Build pricingData for PricingSection components
  const pricingData: PricingData = {
    // Derive invoiceType from package linkage
    invoiceType: selectedPackageId ? 'part_of_package' : 'individual_item',
    pricingType: (getValues('pricingType') || 'per_person') as PricingData['pricingType'],
    totalPriceCents: getValues('totalPriceCents') || 0,
    taxesAndFeesCents: getValues('taxesAndFeesCents') || 0,
    currency: getValues('currency') || 'CAD',
    confirmationNumber: getValues('confirmationNumber') || '',
    commissionTotalCents: getValues('commissionTotalCents') || 0,
    commissionSplitPercentage: getValues('commissionSplitPercentage') || 0,
    commissionExpectedDate: getValues('commissionExpectedDate') || null,
    termsAndConditions: getValues('termsAndConditions') || '',
    cancellationPolicy: getValues('cancellationPolicy') || '',
    supplier: getValues('supplier') || '',
    pricingBreakdown,
  }

  // Get travelers from trip data
  const travelers = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Dining Updated!' : 'Dining Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Dining Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-orange-500 rounded-lg flex items-center justify-center">
          <UtensilsCrossed className="h-8 w-8 text-white" />
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
                    <AvatarFallback className="bg-orange-500 text-white text-xs">
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
                onValueChange={(v) => setValue('status', v as DiningFormData['status'], { shouldDirty: true })}
              >
                <SelectTrigger className="w-32 h-8">
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
          {autoSaveStatus === 'saving' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="text-gray-500">Saving...</span>
            </>
          )}
          {autoSaveStatus === 'saved' && lastSavedAt && (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-gray-500">
                Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
              </span>
            </>
          )}
          {autoSaveStatus === 'error' && (
            <>
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Error - Click Save to retry</span>
            </>
          )}
          {autoSaveStatus === 'idle' && (
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
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            General Info
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="booking"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent px-6 py-3"
          >
            Booking & Pricing
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent px-6 py-3"
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
                  Paste restaurant confirmation details or describe the dining reservation, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste reservation confirmation or describe the dining experience..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAiSubmit} className="bg-orange-600 hover:bg-orange-700">
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Restaurant Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Restaurant Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="diningDetails.restaurantName">
                <label className="text-sm font-medium text-gray-700">Restaurant Name *</label>
                <Input
                  {...register('diningDetails.restaurantName')}
                  placeholder="e.g., Le Bernardin"
                />
                {errors.diningDetails?.restaurantName && (
                  <p className="text-sm text-red-600">{getErrorMessage(errors, 'diningDetails.restaurantName')}</p>
                )}
              </div>

              <div className="space-y-2" data-field="confirmationNumber">
                <label className="text-sm font-medium text-gray-700">Confirmation Number</label>
                <Input
                  {...register('confirmationNumber')}
                  placeholder="Reservation reference"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="diningDetails.cuisineType">
                <label className="text-sm font-medium text-gray-700">Cuisine Type</label>
                <Input
                  {...register('diningDetails.cuisineType')}
                  placeholder="e.g., French, Italian, Japanese"
                />
              </div>

              <div className="space-y-2" data-field="diningDetails.mealType">
                <label className="text-sm font-medium text-gray-700">Meal Type</label>
                <Select
                  value={mealTypeValue}
                  onValueChange={(v) => setValue('diningDetails.mealType', v as DiningFormData['diningDetails']['mealType'], { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2" data-field="diningDetails.address">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Textarea
                {...register('diningDetails.address')}
                placeholder="Full restaurant address"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="diningDetails.phone">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  {...register('diningDetails.phone')}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="space-y-2" data-field="diningDetails.website">
                <label className="text-sm font-medium text-gray-700">Website</label>
                <Input
                  {...register('diningDetails.website')}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2" data-field="diningDetails.menuUrl">
              <label className="text-sm font-medium text-gray-700">Menu URL</label>
              <Input
                {...register('diningDetails.menuUrl')}
                placeholder="https://restaurant.com/menu"
              />
            </div>
          </div>

          {/* Reservation Details */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Reservation Details</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2" data-field="diningDetails.reservationDate">
                <label className="text-sm font-medium text-gray-700">Date</label>
                <DatePickerEnhanced
                  value={reservationDateValue}
                  onChange={(v) => setValue('diningDetails.reservationDate', v ?? '', { shouldDirty: true })}
                  placeholder="YYYY-MM-DD"
                  defaultMonthHint={tripMonthHint}
                />
                <TripDateWarning
                  date={reservationDateValue}
                  tripStartDate={trip?.startDate}
                  tripEndDate={trip?.endDate}
                  fieldLabel="Reservation date"
                />
                {/* Day assignment feedback for pendingDay mode */}
                {pendingDay && (
                  <div className="mt-2">
                    {reservationDateValue && matchedDay ? (
                      <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                        <Check className="h-4 w-4" />
                        This dining will be added to <strong>Day {matchedDay.dayNumber}</strong>
                      </p>
                    ) : reservationDateValue && !matchedDay ? (
                      <p className="text-sm text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        No matching day found for this date
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="space-y-2" data-field="diningDetails.reservationTime">
                <label className="text-sm font-medium text-gray-700">Time</label>
                <TimePicker
                  value={reservationTimeValue}
                  onChange={(v) => setValue('diningDetails.reservationTime', v ?? '', { shouldDirty: true })}
                  placeholder="HH:MM"
                />
              </div>
              <div className="space-y-2" data-field="diningDetails.partySize">
                <label className="text-sm font-medium text-gray-700">Party Size</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={partySizeValue ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      setValue('diningDetails.partySize', null, { shouldDirty: true })
                    } else {
                      const num = parseInt(value, 10)
                      if (!isNaN(num)) {
                        setValue('diningDetails.partySize', Math.min(100, Math.max(1, num)), { shouldDirty: true })
                      }
                    }
                  }}
                  placeholder="1-100"
                />
              </div>
            </div>

            <div className="space-y-2" data-field="diningDetails.timezone">
              <label className="text-sm font-medium text-gray-700">Timezone</label>
              <Select
                value={timezoneValue || ''}
                onValueChange={(v) => setValue('diningDetails.timezone', v, { shouldDirty: true })}
              >
                <SelectTrigger className="w-full max-w-xs">
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

          {/* Additional Details */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Additional Details</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="diningDetails.priceRange">
                <label className="text-sm font-medium text-gray-700">Price Range</label>
                <Input
                  {...register('diningDetails.priceRange')}
                  placeholder="e.g., $$, $$$, $$$$"
                />
              </div>

              <div className="space-y-2" data-field="diningDetails.dressCode">
                <label className="text-sm font-medium text-gray-700">Dress Code</label>
                <Input
                  {...register('diningDetails.dressCode')}
                  placeholder="e.g., Casual, Smart Casual, Formal"
                />
              </div>
            </div>
          </div>

          {/* Dietary Requirements */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Dietary Requirements</h3>
            <p className="text-sm text-gray-600">Select dietary requirements for the party</p>

            <div className="flex flex-wrap gap-2">
              {COMMON_DIETARY_REQUIREMENTS.map((requirement) => {
                const currentRequirements = getValues('diningDetails.dietaryRequirements') || []
                const isSelected = currentRequirements.includes(requirement)
                return (
                  <Badge
                    key={requirement}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => toggleDietaryRequirement(requirement)}
                  >
                    {requirement}
                  </Badge>
                )
              })}
            </div>
          </div>

          {/* Special Requests */}
          <div className="space-y-2 pt-4 border-t" data-field="diningDetails.specialRequests">
            <label className="text-sm font-medium text-gray-700">Special Requests</label>
            <Textarea
              {...register('diningDetails.specialRequests')}
              placeholder="Window seating, birthday celebration, high chair needed, allergies..."
              className="min-h-[100px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2" data-field="description">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              {...register('description')}
              placeholder="Add a description for this dining experience..."
              className="min-h-[100px]"
            />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="dining"
              itineraryId={itineraryId}
              title="Dining Photos"
              description="Restaurant photos, menu images, and dining experience"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the dining reservation first to upload media.</p>
              <p className="text-sm mt-1">Media will be available after the dining reservation is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the dining reservation first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the dining reservation is created.</p>
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
                      Mark this dining reservation as booked when it&apos;s been confirmed
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
            onUpdate={(updates) => {
              if ('pricingBreakdown' in updates) {
                setPricingBreakdown(updates.pricingBreakdown ?? null)
              }
              Object.entries(updates).forEach(([key, value]) => {
                if (key === 'pricingBreakdown') return
                setValue(key as keyof DiningFormData, value as any, { shouldDirty: true, shouldValidate: true })
              })
            }}
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
              tripId={trip?.id || ''}
            />
          </div>

          <Separator />

          {/* Booking Details */}
          <BookingDetailsSection
            pricingData={pricingData}
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([key, value]) => {
                setValue(key as keyof DiningFormData, value as any, { shouldDirty: true, shouldValidate: true })
              })
            }}
            onSupplierDefaultsApplied={(defaults: SupplierDefaults) => {
              setSupplierCommissionRate(defaults.commissionRate)
            }}
          />

          <Separator />

          {/* Commission Section */}
          <CommissionSection
            pricingData={pricingData}
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([key, value]) => {
                setValue(key as keyof DiningFormData, value as any, { shouldDirty: true, shouldValidate: true })
              })
            }}
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
        <Button onClick={handleSubmit} className="bg-orange-600 hover:bg-orange-700">
          {isEditing ? 'Save Changes' : 'Create Dining'}
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

      {/* Mark As Booked Modal */}
      <MarkActivityBookedModal
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
        activityName="Dining Reservation"
        isBooked={activityIsBooked}
        currentBookingDate={activityBookingDate}
        onConfirm={handleMarkAsBooked}
        isPending={markActivityBooked.isPending}
      />
    </div>
  )
}
