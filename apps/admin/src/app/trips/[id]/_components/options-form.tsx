'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Settings, ChevronDown, ChevronUp, Sparkles, Loader2, Check, AlertCircle, DollarSign, FileText, ImageIcon, CalendarCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ActivityResponseDto, OptionCategory, ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useCreateOptions, useUpdateOptions, useOptions } from '@/hooks/use-options'
import { useMarkActivityBooked } from '@/hooks/use-activity-bookings'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { useBookings } from '@/hooks/use-bookings'
import { MarkActivityBookedModal, BookingStatusBadge } from '@/components/activities/mark-activity-booked-modal'
import { ChildOfPackageBookingSection } from '@/components/activities/child-of-package-booking-section'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { PaymentScheduleSection } from './payment-schedule-section'
import { type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { Separator } from '@/components/ui/separator'
import {
  optionsFormSchema,
  toOptionsDefaults,
  toOptionsApiPayload,
  OPTIONS_FORM_FIELDS,
  type OptionsFormData,
} from '@/lib/validation'
import { mapServerErrors, scrollToFirstError, getErrorMessage } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'

interface OptionsFormProps {
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

const STATUSES = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const OPTION_CATEGORIES: { value: OptionCategory; label: string }[] = [
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'add_on', label: 'Add-on' },
  { value: 'tour', label: 'Tour' },
  { value: 'excursion', label: 'Excursion' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'meal_plan', label: 'Meal Plan' },
  { value: 'other', label: 'Other' },
]

// Auto-save watched fields (trigger save when these change)
const AUTO_SAVE_FIELDS = [
  'name',
  'description',
  'status',
  'optionsDetails.optionCategory',
  'optionsDetails.isSelected',
  'optionsDetails.availabilityStartDate',
  'optionsDetails.availabilityEndDate',
  'optionsDetails.bookingDeadline',
  'optionsDetails.minParticipants',
  'optionsDetails.maxParticipants',
  'optionsDetails.spotsAvailable',
  'optionsDetails.durationMinutes',
  'optionsDetails.meetingPoint',
  'optionsDetails.meetingTime',
  'optionsDetails.providerName',
  'optionsDetails.providerPhone',
  'optionsDetails.providerEmail',
  'optionsDetails.providerWebsite',
  'optionsDetails.inclusions',
  'optionsDetails.exclusions',
  'optionsDetails.requirements',
  'optionsDetails.whatToBring',
  'optionsDetails.displayOrder',
  'optionsDetails.highlightText',
  'optionsDetails.instructionsText',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'confirmationNumber',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
] as const

export function OptionsForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: OptionsFormProps) {
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

  // Auto-save status tracking (with date validation)
  const { saveStatus, setSaveStatus, lastSavedAt, setLastSavedAt } = useSaveStatus({
    activityId: activity?.id,
    updatedAt: activity?.updatedAt,
  })
  const failureToastShown = useRef(false)
  const lastSavedSnapshotRef = useRef<string | null>(null)

  // Initialize form with RHF + Zod
  // Pass dayId to defaults so itineraryDayId is set for non-pendingDay mode
  const form = useForm<OptionsFormData>({
    resolver: zodResolver(optionsFormSchema),
    defaultValues: toOptionsDefaults({ itineraryDayId: dayId } as any, dayDate, trip?.currency),
    mode: 'onSubmit', // Validate on submit to avoid render-time issues
  })

  const {
    control,
    register,
    setValue,
    getValues,
    reset,
    setError,
    formState: { errors, isDirty, isValid, isValidating, isSubmitting },
  } = form

  // Watch specific fields for auto-save
  const watchedFields = useWatch({
    control,
    name: AUTO_SAVE_FIELDS as unknown as (keyof OptionsFormData)[],
  })

  // Watch specific fields for display
  const watchedName = useWatch({ control, name: 'name' })
  const watchedStatus = useWatch({ control, name: 'status' })

  // Watch custom component fields (Selects, DatePickers, TimePicker, Checkbox, number inputs with null)
  const optionCategoryValue = useWatch({ control, name: 'optionsDetails.optionCategory' })
  const isSelectedValue = useWatch({ control, name: 'optionsDetails.isSelected' })
  const availabilityStartDateValue = useWatch({ control, name: 'optionsDetails.availabilityStartDate' })
  const availabilityEndDateValue = useWatch({ control, name: 'optionsDetails.availabilityEndDate' })
  const bookingDeadlineValue = useWatch({ control, name: 'optionsDetails.bookingDeadline' })
  const meetingTimeValue = useWatch({ control, name: 'optionsDetails.meetingTime' })
  const minParticipantsValue = useWatch({ control, name: 'optionsDetails.minParticipants' })
  const maxParticipantsValue = useWatch({ control, name: 'optionsDetails.maxParticipants' })
  const spotsAvailableValue = useWatch({ control, name: 'optionsDetails.spotsAvailable' })
  const durationMinutesValue = useWatch({ control, name: 'optionsDetails.durationMinutes' })
  const displayOrderValue = useWatch({ control, name: 'optionsDetails.displayOrder' })
  // Watch array fields for controlled editing
  const inclusionsValue = useWatch({ control, name: 'optionsDetails.inclusions' })
  const exclusionsValue = useWatch({ control, name: 'optionsDetails.exclusions' })
  const requirementsValue = useWatch({ control, name: 'optionsDetails.requirements' })
  const whatToBringValue = useWatch({ control, name: 'optionsDetails.whatToBring' })

  // Fetch options data (for edit mode)
  const { data: optionsData } = useOptions(activityId || '')

  // Trip month hint for date picker calendar default
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Derive dayId from availability start date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, availabilityStartDateValue)
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

  // Auto-populate availability start date from day context (only for new activities)
  // Uses watched availabilityStartDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!availabilityStartDateValue) {
      dayDateAppliedRef.current = true
      setValue('optionsDetails.availabilityStartDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, availabilityStartDateValue, setValue])

  // Mutations - use effectiveDayId for pendingDay mode
  const createOptions = useCreateOptions(itineraryId, effectiveDayId)
  const updateOptions = useUpdateOptions(itineraryId, effectiveDayId)

  // Booking status mutation
  const markActivityBooked = useMarkActivityBooked()

  // Handler for marking option as booked
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

  // Build pricingData from form values (memoized for BookingDetailsSection)
  const pricingData: PricingData = useMemo(() => {
    void watchedFields
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
  }, [watchedFields, getValues, selectedPackageId, pricingBreakdown])

  // Handler for pricing/booking/commission section updates
  const handlePricingUpdate = useCallback((updates: Partial<PricingData>) => {
    if ('pricingBreakdown' in updates) {
      setPricingBreakdown(updates.pricingBreakdown ?? null)
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'pricingBreakdown') return
      setValue(key as keyof OptionsFormData, value as any, { shouldDirty: true, shouldValidate: true })
    })
  }, [setValue])

  // Handler for when supplier defaults are applied from SupplierCombobox
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  // Ref to track loaded options ID
  const optionsIdRef = useRef<string | null>(null)

  // Smart re-seeding: only when options ID actually changes
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (optionsData && optionsData.id !== optionsIdRef.current) {
      optionsIdRef.current = optionsData.id

      setActivityId(optionsData.id)
      setActivityPricingId(optionsData.activityPricingId || null)

      // Reset form with server data
      const serverFormData = toOptionsDefaults({
        itineraryDayId: dayId,
        name: optionsData.name,
        description: optionsData.description,
        status: optionsData.status,
        pricingType: optionsData.pricingType || 'per_person',
        currency: optionsData.currency || 'USD',
        totalPriceCents: optionsData.totalPriceCents,
        taxesAndFeesCents: optionsData.taxesAndFeesCents,
        confirmationNumber: optionsData.confirmationNumber || '',
        commissionTotalCents: optionsData.commissionTotalCents,
        commissionSplitPercentage: optionsData.commissionSplitPercentage ? parseFloat(optionsData.commissionSplitPercentage) : null,
        commissionExpectedDate: optionsData.commissionExpectedDate,
        optionsDetails: optionsData.optionsDetails || undefined,
        // Booking details
        termsAndConditions: optionsData.termsAndConditions || '',
        cancellationPolicy: optionsData.cancellationPolicy || '',
        supplier: optionsData.supplier || '',
      } as any, dayDate, trip?.currency)

      // Use queueMicrotask to defer form reset outside React's render cycle
      queueMicrotask(() => {
        if (!cancelled) {
          reset(serverFormData, { keepDirty: false })
          lastSavedSnapshotRef.current = JSON.stringify(serverFormData)
        }
      })
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [optionsData, dayId, trip?.currency, dayDate, reset])

  // Auto-save with proper validation gating
  useEffect(() => {
    // Gate: only save when isDirty && isValid && not validating && not submitting && mutations not pending
    if (!isDirty || !isValid || isValidating || isSubmitting) {
      return
    }
    if (createOptions.isPending || updateOptions.isPending) {
      return
    }

    const currentSnapshot = JSON.stringify(getValues())
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return // No actual changes
    }

    const saveTimer = setTimeout(async () => {
      // SAFETY NET: Check refs to prevent duplicate creation race condition
      if (createInProgressRef.current) {
        return
      }

      try {
        setSaveStatus('saving')
        const formData = getValues()
        const apiPayload = toOptionsApiPayload(formData)

        let response: any
        // Use ref for immediate check (state may be stale)
        if (activityId || activityIdRef.current) {
          const id = activityId || activityIdRef.current!
          response = await updateOptions.mutateAsync({ id, data: { optionsDetails: apiPayload.optionsDetails } })
        } else {
          // Mark create as in progress before API call
          createInProgressRef.current = true
          try {
            response = await createOptions.mutateAsync(apiPayload)
          } finally {
            createInProgressRef.current = false
          }
        }

        // Update activity ID on create
        if (response?.id && !activityIdRef.current) {
          // Update ref immediately (synchronous) before React state update
          activityIdRef.current = response.id
          setActivityId(response.id)
        }

        lastSavedSnapshotRef.current = currentSnapshot
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        failureToastShown.current = false
      } catch (err: any) {
        setSaveStatus('error')
        // Map server errors to form fields
        if (err?.errors) {
          mapServerErrors(err.errors, setError, OPTIONS_FORM_FIELDS)
        }
        if (!failureToastShown.current) {
          failureToastShown.current = true
          toast({
            title: 'Auto-save failed',
            description: err.message || 'Could not save option',
            variant: 'destructive',
          })
        }
      }
    }, 1000) // 1 second debounce

    return () => clearTimeout(saveTimer)
  }, [
    watchedFields,
    isDirty,
    isValid,
    isValidating,
    isSubmitting,
    activityId,
    getValues,
    createOptions,
    updateOptions,
    setError,
    toast,
    setLastSavedAt,
    setSaveStatus,
  ])

  // Array field helpers (convert string to array on newlines/commas)
  const parseArrayField = (value: string): string[] => {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(item => item.length > 0)
  }

  const formatArrayField = (arr: string[] | undefined): string => {
    return (arr || []).join('\n')
  }

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing option information...',
    })
    setAiInput('')
  }

  // Force save handler
  const handleForceSave = async () => {
    if (!isValid) {
      scrollToFirstError(errors)
      return
    }
    try {
      setSaveStatus('saving')
      const formData = getValues()
      const payload = { ...formData, pricingBreakdownJson: pricingBreakdown }
      const apiPayload = toOptionsApiPayload(payload)

      let response: any
      if (activityId) {
        response = await updateOptions.mutateAsync({ id: activityId, data: { optionsDetails: apiPayload.optionsDetails } })
      } else {
        response = await createOptions.mutateAsync(apiPayload)
      }

      if (!activityId && response?.id) {
        setActivityId(response.id)
      }

      lastSavedSnapshotRef.current = JSON.stringify(payload)
      setLastSavedAt(new Date())
      setSaveStatus('saved')

      // Show success overlay and redirect
      setShowSuccess(true)
    } catch (err: any) {
      setSaveStatus('error')
      if (err?.errors) {
        mapServerErrors(err.errors, setError, OPTIONS_FORM_FIELDS)
      }
      toast({
        title: 'Save failed',
        description: err.message || 'Could not save option',
        variant: 'destructive',
      })
    }
  }

  // Get travelers from trip data
  const travelers = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Option Updated!' : 'Option Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Options Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-purple-500 rounded-lg flex items-center justify-center">
          <Settings className="h-8 w-8 text-white" />
        </div>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-400 mb-3">
            {watchedName || 'Option title will be automatically generated'}
          </h1>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Travelers */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Travelers ({travelers.length} of {totalTravelers})</span>
              <div className="flex -space-x-2">
                {travelers.map((traveler: any) => (
                  <Avatar key={traveler.id} className="w-8 h-8 border-2 border-white">
                    <AvatarFallback className="bg-purple-500 text-white text-xs">
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
                value={watchedStatus || 'proposed'}
                onValueChange={(value) => setValue('status', value as any, { shouldDirty: true, shouldValidate: true })}
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
          {/* Validation indicator */}
          {!isValid && Object.keys(errors).length > 0 && (
            <span className="text-amber-600 text-xs">
              ({Object.keys(errors).length} validation {Object.keys(errors).length === 1 ? 'error' : 'errors'})
            </span>
          )}
        </div>
      </div>

      {/* Tabbed Interface - Full 5 tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Details
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
                  Paste option details, tour descriptions, or package information, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste option details, tour information, or package descriptions..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAiSubmit} className="bg-purple-600 hover:bg-purple-700">
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Option Classification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Option Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Option Name</label>
                  <Input
                    {...register('name')}
                    placeholder="e.g., Snorkeling Excursion"
                    data-field="name"
                  />
                  {errors.name && <p className="text-sm text-red-600">{getErrorMessage(errors, 'name')}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <Select
                    value={optionCategoryValue || ''}
                    onValueChange={(v) => setValue('optionsDetails.optionCategory', v as OptionCategory, { shouldDirty: true })}
                  >
                    <SelectTrigger data-field="optionsDetails.optionCategory">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPTION_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  {...register('description')}
                  placeholder="Brief description of this option..."
                  className="min-h-[80px]"
                  data-field="description"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isSelected"
                  checked={isSelectedValue || false}
                  onCheckedChange={(checked) => setValue('optionsDetails.isSelected', checked === true, { shouldDirty: true })}
                />
                <label
                  htmlFor="isSelected"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Selected by traveler
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Availability & Booking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Availability & Booking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Available From</label>
                  <DatePickerEnhanced
                    value={availabilityStartDateValue || undefined}
                    onChange={(date) => setValue('optionsDetails.availabilityStartDate', date ?? null, { shouldDirty: true })}
                    placeholder="Start date"
                    defaultMonthHint={tripMonthHint}
                    data-field="optionsDetails.availabilityStartDate"
                  />
                  <TripDateWarning
                    date={availabilityStartDateValue}
                    tripStartDate={trip?.startDate}
                    tripEndDate={trip?.endDate}
                    fieldLabel="Availability start"
                  />
                  {/* Day assignment feedback for pendingDay mode */}
                  {pendingDay && (
                    <div className="mt-2">
                      {availabilityStartDateValue && matchedDay ? (
                        <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                          <Check className="h-4 w-4" />
                          This option will be added to <strong>Day {matchedDay.dayNumber}</strong>
                        </p>
                      ) : availabilityStartDateValue && !matchedDay ? (
                        <p className="text-sm text-amber-600 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4" />
                          No matching day found for this date
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Available Until</label>
                  <DatePickerEnhanced
                    value={availabilityEndDateValue || undefined}
                    onChange={(date) => setValue('optionsDetails.availabilityEndDate', date ?? null, { shouldDirty: true })}
                    placeholder="End date"
                    defaultMonthHint={tripMonthHint}
                    data-field="optionsDetails.availabilityEndDate"
                  />
                  <TripDateWarning
                    date={availabilityEndDateValue}
                    tripStartDate={trip?.startDate}
                    tripEndDate={trip?.endDate}
                    fieldLabel="Availability end"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Booking Deadline</label>
                  <DatePickerEnhanced
                    value={bookingDeadlineValue || undefined}
                    onChange={(date) => setValue('optionsDetails.bookingDeadline', date ?? null, { shouldDirty: true })}
                    placeholder="Deadline"
                    defaultMonthHint={tripMonthHint}
                    data-field="optionsDetails.bookingDeadline"
                  />
                  <TripDateWarning
                    date={bookingDeadlineValue}
                    tripStartDate={trip?.startDate}
                    tripEndDate={trip?.endDate}
                    fieldLabel="Booking deadline"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Min Participants</label>
                  <Input
                    type="number"
                    min="0"
                    value={minParticipantsValue ?? ''}
                    onChange={(e) => setValue('optionsDetails.minParticipants', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    placeholder="0"
                    data-field="optionsDetails.minParticipants"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Max Participants</label>
                  <Input
                    type="number"
                    min="0"
                    value={maxParticipantsValue ?? ''}
                    onChange={(e) => setValue('optionsDetails.maxParticipants', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    placeholder="No limit"
                    data-field="optionsDetails.maxParticipants"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Spots Available</label>
                  <Input
                    type="number"
                    min="0"
                    value={spotsAvailableValue ?? ''}
                    onChange={(e) => setValue('optionsDetails.spotsAvailable', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    placeholder="Unlimited"
                    data-field="optionsDetails.spotsAvailable"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Duration & Meeting */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Duration & Meeting</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Duration (minutes)</label>
                  <Input
                    type="number"
                    min="0"
                    value={durationMinutesValue ?? ''}
                    onChange={(e) => setValue('optionsDetails.durationMinutes', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    placeholder="e.g., 120"
                    data-field="optionsDetails.durationMinutes"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Meeting Point</label>
                  <Input
                    {...register('optionsDetails.meetingPoint')}
                    placeholder="e.g., Hotel Lobby"
                    data-field="optionsDetails.meetingPoint"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Meeting Time</label>
                  <TimePicker
                    value={meetingTimeValue || undefined}
                    onChange={(time) => setValue('optionsDetails.meetingTime', time ?? '', { shouldDirty: true })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Provider Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Provider Name</label>
                  <Input
                    {...register('optionsDetails.providerName')}
                    placeholder="e.g., Island Tours LLC"
                    data-field="optionsDetails.providerName"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Phone</label>
                  <Input
                    {...register('optionsDetails.providerPhone')}
                    placeholder="Provider contact number"
                    data-field="optionsDetails.providerPhone"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <Input
                    {...register('optionsDetails.providerEmail')}
                    type="email"
                    placeholder="provider@example.com"
                    data-field="optionsDetails.providerEmail"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Website</label>
                  <Input
                    {...register('optionsDetails.providerWebsite')}
                    placeholder="https://..."
                    data-field="optionsDetails.providerWebsite"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Display Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Display Options</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Display Order</label>
                  <Input
                    type="number"
                    value={displayOrderValue ?? ''}
                    onChange={(e) => setValue('optionsDetails.displayOrder', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                    placeholder="e.g., 1"
                    data-field="optionsDetails.displayOrder"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Highlight Text</label>
                  <Input
                    {...register('optionsDetails.highlightText')}
                    placeholder="e.g., Best Seller!"
                    maxLength={100}
                    data-field="optionsDetails.highlightText"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab - Inclusions/Exclusions/Requirements */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Inclusions & Exclusions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What&apos;s Included & Excluded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Inclusions</label>
                  <Textarea
                    value={formatArrayField(inclusionsValue)}
                    onChange={(e) => setValue('optionsDetails.inclusions', parseArrayField(e.target.value), { shouldDirty: true })}
                    placeholder="Enter each item on a new line:
Transportation
Snorkeling gear
Guide services
Lunch"
                    className="min-h-[120px]"
                    data-field="optionsDetails.inclusions"
                  />
                  <p className="text-xs text-gray-500">One item per line</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Exclusions</label>
                  <Textarea
                    value={formatArrayField(exclusionsValue)}
                    onChange={(e) => setValue('optionsDetails.exclusions', parseArrayField(e.target.value), { shouldDirty: true })}
                    placeholder="Enter each item on a new line:
Gratuities
Personal expenses
Travel insurance"
                    className="min-h-[120px]"
                    data-field="optionsDetails.exclusions"
                  />
                  <p className="text-xs text-gray-500">One item per line</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Requirements & What to Bring */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Requirements & Preparation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Requirements</label>
                  <Textarea
                    value={formatArrayField(requirementsValue)}
                    onChange={(e) => setValue('optionsDetails.requirements', parseArrayField(e.target.value), { shouldDirty: true })}
                    placeholder="Enter each requirement on a new line:
Minimum age 12 years
Moderate fitness level
Ability to swim"
                    className="min-h-[120px]"
                    data-field="optionsDetails.requirements"
                  />
                  <p className="text-xs text-gray-500">One item per line</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">What to Bring</label>
                  <Textarea
                    value={formatArrayField(whatToBringValue)}
                    onChange={(e) => setValue('optionsDetails.whatToBring', parseArrayField(e.target.value), { shouldDirty: true })}
                    placeholder="Enter each item on a new line:
Sunscreen
Comfortable shoes
Camera
Water bottle"
                    className="min-h-[120px]"
                    data-field="optionsDetails.whatToBring"
                  />
                  <p className="text-xs text-gray-500">One item per line</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Instructions Text</label>
                <Textarea
                  {...register('optionsDetails.instructionsText')}
                  placeholder="Detailed instructions for participants..."
                  className="min-h-[150px]"
                  data-field="optionsDetails.instructionsText"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="option"
              itineraryId={itineraryId}
              title="Option Photos"
              description="Images and photos for this optional add-on"
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-gray-500">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Save the option first to upload media.</p>
                  <p className="text-sm mt-1">Media will be available after the option is created.</p>
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
            <div className="text-center py-12 text-gray-500">
              <p>Save the option first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the option is created.</p>
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
                      Mark this option as booked when it&apos;s been confirmed
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
            userSplitValue={userProfile?.commissionSettings?.splitValue ?? null}
            userSplitType={userProfile?.commissionSettings?.splitType ?? null}
          />
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handleForceSave} className="bg-purple-600 hover:bg-purple-700">
          Save Option
        </Button>
      </div>

      {/* Travelers Dialog */}
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
        activityName="Option"
        isBooked={activityIsBooked}
        currentBookingDate={activityBookingDate}
        onConfirm={handleMarkAsBooked}
        isPending={markActivityBooked.isPending}
      />
    </div>
  )
}
