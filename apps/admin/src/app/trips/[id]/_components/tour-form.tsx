'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Compass, ChevronDown, ChevronUp, Sparkles, Check, AlertCircle, Plus, X } from 'lucide-react'
import type { ActivityResponseDto, ItineraryDayWithActivitiesDto, NormalizedTourActivity } from '@tailfire/shared-types/api'
import { ActivitySearchPanel } from '@/components/activity-search-panel'
import { Button } from '@/components/ui/button'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useCreateTour, useUpdateTour, useTour } from '@/hooks/use-tours'
import { useQueryClient } from '@tanstack/react-query'
import { componentMediaKeys } from '@/hooks/use-component-media'
import { api } from '@/lib/api'
import { useIsChildOfPackage } from '@/hooks/use-is-child-of-package'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { PaymentScheduleSection } from './payment-schedule-section'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { buildInitialPricingState, type PricingData, type PricingBreakdownItem } from '@/lib/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { ActivityCommentsPanel } from '@/components/activities/activity-comments-panel'
import { BookingHeaderButton } from '@/components/activities/booking-header-button'
import { useBookings } from '@/hooks/use-bookings'
import {
  tourFormSchema,
  toTourDefaults,
  parseTourNotesToDetails,
  TOUR_SUBTYPES,
  type TourFormData,
} from '@/lib/validation/tour-validation'
import { getErrorMessage, scrollToFirstError, flattenErrors, formatFieldLabel } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'

interface TourFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  trip?: any
  onSuccess?: () => void
  onCancel?: () => void
  pendingDay?: boolean
  days?: ItineraryDayWithActivitiesDto[]
}

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
] as const

export function TourForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: TourFormProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const isEditing = !!activity
  const { returnToItinerary } = useActivityNavigation()

  // Extract day's start/end locations for activity search
  const searchLocations = useMemo(() => {
    const currentDay = days.find((d) => d.id === dayId)
    if (!currentDay) return []
    const locs: Array<{ label: string; lat: number; lng: number }> = []

    // 1. Prefer day-level start/end locations
    if (currentDay.startLocationLat != null && currentDay.startLocationLng != null) {
      locs.push({
        label: currentDay.startLocationName || 'Start location',
        lat: currentDay.startLocationLat,
        lng: currentDay.startLocationLng,
      })
    }
    if (currentDay.endLocationLat != null && currentDay.endLocationLng != null &&
        (currentDay.endLocationLat !== currentDay.startLocationLat || currentDay.endLocationLng !== currentDay.startLocationLng)) {
      locs.push({
        label: currentDay.endLocationName || 'End location',
        lat: currentDay.endLocationLat,
        lng: currentDay.endLocationLng,
      })
    }

    // 2. Fallback: check activities on this day for coordinates
    if (locs.length === 0 && currentDay.activities) {
      for (const act of currentDay.activities) {
        const coords = act.coordinates as { lat?: number; lng?: number } | null
        if (coords?.lat != null && coords?.lng != null) {
          locs.push({
            label: act.location || act.name || 'Activity location',
            lat: coords.lat,
            lng: coords.lng,
          })
          break // Use first activity with coordinates
        }
      }
    }

    return locs
  }, [days, dayId])

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

  const queryClient = useQueryClient()
  const [showSuccess, setShowSuccess] = useState(false)
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false)
  const [showActivitySearch, setShowActivitySearch] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [showTravelersDialog, setShowTravelersDialog] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'booking' ? 'booking' : 'general'
  })

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)

  // Safety net refs to prevent duplicate creation race condition

  // Pending Amadeus pictures to import after activity is created
  const pendingPicturesRef = useRef<string[]>([])

  // Activity pricing ID (gated on this for payment schedule)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // Booking status tracking
  const [isBooked, setIsBooked] = useState<boolean>(false)
  const [bookingDate, setBookingDate] = useState<string | null>(null)

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

  // Child of package guard - disables pricing/booking when activity is linked to a package
  const { isChildOfPackage, parentPackageName, parentPackageId } = useIsChildOfPackage(activity)

  // Fetch user profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Autosave was removed in #306. Form saves only via the manual Save Changes
  // button. The header "Unsaved changes" badge below reflects RHF's isDirty.

  // Tag input states for inclusions, exclusions, whatToBring
  const [inclusionInput, setInclusionInput] = useState('')
  const [exclusionInput, setExclusionInput] = useState('')
  const [whatToBringInput, setWhatToBringInput] = useState('')

  // Initialize react-hook-form with Zod validation
  const form = useForm<TourFormData>({
    resolver: zodResolver(tourFormSchema),
    defaultValues: toTourDefaults({ itineraryDayId: dayId }, dayDate, trip?.currency),
    mode: 'onSubmit',
  })

  const {
    control,
    register,
    setValue,
    getValues,
    reset,
    trigger,
    formState: { errors, isDirty, isValid },
  } = form

  // useWatch for custom components
  const statusValue = useWatch({ control, name: 'proposalStatus' })
  const tourSubtypeValue = useWatch({ control, name: 'tourDetails.tourSubtype' })
  const tourDateValue = useWatch({ control, name: 'tourDetails.tourDate' })
  const startTimeValue = useWatch({ control, name: 'tourDetails.startTime' })
  const endTimeValue = useWatch({ control, name: 'tourDetails.endTime' })
  const timezoneValue = useWatch({ control, name: 'tourDetails.timezone' })
  const isOvernightValue = useWatch({ control, name: 'tourDetails.isOvernight' })
  const durationMinutesValue = useWatch({ control, name: 'tourDetails.durationMinutes' })
  const inclusionsValue = useWatch({ control, name: 'tourDetails.inclusions' }) || []
  const exclusionsValue = useWatch({ control, name: 'tourDetails.exclusions' }) || []
  const whatToBringValue = useWatch({ control, name: 'tourDetails.whatToBring' }) || []
  const tourNameValue = useWatch({ control, name: 'tourDetails.tourName' })

  // Auto-generate activity name from tour name
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'tour',
    control,
    setValue,
    tourName: tourNameValue,
  })

  // Fetch tour data (for edit mode)
  const { data: tourData } = useTour(dayId, activityId)

  // Trip month hint for date pickers
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Track if dayDate has been auto-applied (prevents duplicate application)
  const dayDateAppliedRef = useRef(false)

  // Reset the ref when dayId changes (handles navigation between different days)
  useEffect(() => {
    dayDateAppliedRef.current = false
  }, [dayId])

  // Auto-populate tour date from day context (only for new activities)
  // Uses watched tourDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!tourDateValue) {
      dayDateAppliedRef.current = true
      setValue('tourDetails.tourDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, tourDateValue, setValue])

  // Derive dayId from tour date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, tourDateValue)
  const effectiveDayId = pendingDay ? (computedDayId || '') : dayId

  // In pendingDay mode, sync computed dayId to form field
  useEffect(() => {
    if (pendingDay && computedDayId) {
      setValue('itineraryDayId', computedDayId, { shouldDirty: false })
    }
  }, [pendingDay, computedDayId, setValue])

  // Mutations
  const createTour = useCreateTour(itineraryId, effectiveDayId)
  const updateTour = useUpdateTour(itineraryId, effectiveDayId)

  // Import Amadeus pictures to media tab
  const importPicturesToMedia = useCallback(async (targetActivityId: string, pictures: string[]) => {
    const uniquePics = [...new Set(pictures)]
    let imported = 0
    for (const url of uniquePics) {
      try {
        await api.post(`/components/${targetActivityId}/media/external/url?entityType=activity`, {
          url,
          caption: null,
          attribution: { source: 'amadeus' },
        })
        imported++
      } catch (err) {
        console.warn('Failed to import Amadeus picture:', url, err)
      }
    }
    if (imported > 0) {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(targetActivityId, 'activity'),
      })
      toast({
        title: 'Tour photos imported',
        description: `${imported} image${imported > 1 ? 's' : ''} from Amadeus added to the Media tab`,
      })
    }
  }, [queryClient, toast])

  // Import pending Amadeus pictures once activityId is available
  useEffect(() => {
    if (!activityId || pendingPicturesRef.current.length === 0) return

    const pictures = [...pendingPicturesRef.current]
    pendingPicturesRef.current = []

    importPicturesToMedia(activityId, pictures)
  }, [activityId, importPicturesToMedia])

  // Ref to track loaded tour ID
  const tourIdRef = useRef<string | null>(null)

  // Smart re-seeding when tour data changes
  useEffect(() => {
    let cancelled = false

    if (tourData && tourData.id !== tourIdRef.current) {
      tourIdRef.current = tourData.id

      setActivityId(tourData.id)
      setActivityPricingId((tourData as any).activityPricingId || null)

      // Update booking status from server data
      setIsBooked(tourData.bookingStatus === 'booked')
      setBookingDate(tourData.bookingDate ?? null)

      // Build initial pricing state from server data
      const initialPricing = buildInitialPricingState(tourData as any)

      // Parse tour details from notes field
      const parsedDetails = parseTourNotesToDetails(tourData.notes)

      // Extract start/end times from datetime
      let startTime = '09:00'
      let endTime = ''
      if (tourData.startDatetime) {
        const match = tourData.startDatetime.match(/T(\d{2}:\d{2})/)
        if (match && match[1]) startTime = match[1]
      }
      if (tourData.endDatetime) {
        const match = tourData.endDatetime.match(/T(\d{2}:\d{2})/)
        if (match && match[1]) endTime = match[1]
      }

      // Extract date from startDatetime
      let tourDate: string | null = dayDate || null
      if (tourData.startDatetime) {
        const dateMatch = tourData.startDatetime.match(/^(\d{4}-\d{2}-\d{2})/)
        if (dateMatch && dateMatch[1]) tourDate = dateMatch[1]
      }

      const defaults = toTourDefaults({
        itineraryDayId: dayId,
        componentType: 'tour',
        name: tourData.name,
        description: tourData.description,
        proposalStatus: tourData.proposalStatus,
        totalPriceCents: initialPricing.totalPriceCents,
        taxesAndFeesCents: initialPricing.taxesAndFeesCents,
        currency: trip?.currency || initialPricing.currency,
        confirmationNumber: initialPricing.confirmationNumber,
        pricingType: tourData.pricingType || 'per_person',
        tourDetails: {
          tourName: tourData.name || '',
          tourSubtype: parsedDetails.tourSubtype || '',
          location: tourData.location || '',
          address: tourData.address || '',
          tourDate,
          startTime,
          endTime,
          timezone: tourData.timezone || '',
          isOvernight: parsedDetails.isOvernight || false,
          durationMinutes: parsedDetails.durationMinutes || null,
          meetingPoint: parsedDetails.meetingPoint || '',
          providerName: parsedDetails.providerName || '',
          providerPhone: parsedDetails.providerPhone || '',
          providerEmail: parsedDetails.providerEmail || '',
          providerWebsite: parsedDetails.providerWebsite || '',
          inclusions: parsedDetails.inclusions || [],
          exclusions: parsedDetails.exclusions || [],
          whatToBring: parsedDetails.whatToBring || [],
          specialRequests: parsedDetails.specialRequests || '',
        },
        commissionTotalCents: initialPricing.commissionTotalCents,
        commissionSplitPercentage: initialPricing.commissionSplitPercentage,
        commissionExpectedDate: initialPricing.commissionExpectedDate,
        termsAndConditions: initialPricing.termsAndConditions,
        cancellationPolicy: initialPricing.cancellationPolicy,
        supplier: initialPricing.supplier,
      } as any, dayDate, trip?.currency)

      queueMicrotask(() => {
        if (!cancelled) {
          reset(defaults)
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [tourData, dayId, trip?.currency, dayDate, reset])

  // Autosave removed in #306 — see useUnsavedChangesWarning below. The form
  // saves only via the manual Save Changes button (forceSave) or an explicit
  // submit handler. Replacing the old "Saving / Saved X ago" indicator with a
  // dirty-state "Unsaved changes" badge in the header.
  useUnsavedChangesWarning(isDirty)

  // Force save handler
  const forceSave = useCallback(async () => {
    // With mode: 'onSubmit', RHF doesn't populate `errors` until validation
    // runs. Triggering validation first ensures the toast below can name
    // the specific failing fields instead of falling back to the generic
    // "Please fix the errors before saving" message (#298).
    const valid = await trigger()
    if (!valid) {
      scrollToFirstError(form.formState.errors)
      const errorFields = flattenErrors(form.formState.errors as Record<string, unknown>)
      const details = errorFields
        .map(f => {
          const msg = getErrorMessage(form.formState.errors as Record<string, unknown>, f)
          return `${formatFieldLabel(f)}: ${msg || 'invalid'}`
        })
        .join(', ')
      toast({
        title: 'Validation Error',
        description: details || 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      return
    }

    try {
      const formData = getValues()
      const payload = { ...formData, pricingBreakdownJson: pricingBreakdown, bookingDate: bookingDate || null }

      let response
      if (activityId) {
        response = await updateTour.mutateAsync({ id: activityId, data: payload })
      } else {
        response = await createTour.mutateAsync(payload)
      }

      if (!activityId && response.id) {
        setActivityId(response.id)
      }
      if ((response as any).activityPricingId && (response as any).activityPricingId !== activityPricingId) {
        setActivityPricingId((response as any).activityPricingId)
      }

      // Reset RHF dirty state so the "Unsaved changes" badge clears
      reset(getValues(), { keepValues: true, keepDirty: false })
      toast({ title: isEditing ? 'Tour updated' : 'Tour created' })
    } catch (err: any) {
      const fieldErrors = err?.fieldErrors as Array<{ field: string; message: string }> | undefined
      const details = fieldErrors?.map((e: any) => `${e.field}: ${e.message}`).join('; ')
      toast({
        title: 'Save failed',
        description: details || err.message,
        variant: 'destructive',
      })
    }
  }, [
    trigger,
    form,
    reset,
    isEditing,
    activityId,
    activityPricingId,
    getValues,
    pricingBreakdown,
    bookingDate,
    createTour,
    updateTour,
    toast,
  ])

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing tour details...',
    })
    setAiInput('')
  }

  const handleActivitySelect = (activity: NormalizedTourActivity) => {
    setValue('tourDetails.tourName', activity.name || '', { shouldDirty: true })
    setValue('tourDetails.providerName', activity.provider || '', { shouldDirty: true })
    if (activity.description) {
      // Strip HTML tags from description
      const doc = new DOMParser().parseFromString(activity.description, 'text/html')
      setValue('description', doc.body.textContent?.trim() || '', { shouldDirty: true })
    }
    if (activity.duration) {
      // Parse ISO duration like "PT2H30M" or simple "2 hours"
      const match = activity.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
      if (match) {
        const hours = parseInt(match[1] || '0', 10)
        const mins = parseInt(match[2] || '0', 10)
        setValue('tourDetails.durationMinutes', hours * 60 + mins, { shouldDirty: true })
      }
    }
    if (activity.price) {
      setValue('totalPriceCents', Math.round(parseFloat(activity.price.amount) * 100), { shouldDirty: true })
      setValue('currency', activity.price.currency || 'USD', { shouldDirty: true })
    }
    if (activity.location?.address) {
      setValue('tourDetails.location', activity.location.address, { shouldDirty: true })
    } else if (activity.location?.lat && activity.location?.lng) {
      // Amadeus doesn't return address — use coordinates as fallback location text
      setValue('tourDetails.location', `${activity.location.lat.toFixed(4)}, ${activity.location.lng.toFixed(4)}`, { shouldDirty: true })
    }
    if (activity.bookingLink) {
      setValue('tourDetails.providerWebsite', activity.bookingLink, { shouldDirty: true })
    }
    if (activity.pictures?.length) {
      if (activityId) {
        // Activity already saved — import immediately
        importPicturesToMedia(activityId, activity.pictures)
      } else {
        // Activity not yet saved — queue for import after first save
        pendingPicturesRef.current = activity.pictures
      }
    }
    setShowActivitySearch(false)
    toast({
      title: 'Activity Details Applied',
      description: activity.name,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await forceSave()
    // Show success overlay after successful save
    if (isValid) {
      setShowSuccess(true)
    }
  }


  // Tag management helpers
  const addTag = (field: 'tourDetails.inclusions' | 'tourDetails.exclusions' | 'tourDetails.whatToBring', value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const current = getValues(field) || []
    if (!current.includes(trimmed)) {
      setValue(field, [...current, trimmed], { shouldDirty: true })
    }
  }

  const removeTag = (field: 'tourDetails.inclusions' | 'tourDetails.exclusions' | 'tourDetails.whatToBring', value: string) => {
    const current = getValues(field) || []
    setValue(field, current.filter((t: string) => t !== value), { shouldDirty: true })
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
    referralUrl: getValues('referralUrl') || '',
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
    <div className="max-w-5xl relative">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Tour Updated!' : 'Tour Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Tour Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center">
          <Compass className="h-8 w-8 text-white" />
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
                    <AvatarFallback className="bg-orange-600 text-white text-xs">
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
                onValueChange={(v) => setValue('proposalStatus', v as TourFormData['proposalStatus'], { shouldDirty: true })}
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
          activityName={displayName || 'Tour'}
          activityType="tour"
          isBooked={isBooked}
          bookingDate={bookingDate}
          isChildOfPackage={isChildOfPackage}
          parentPackageId={parentPackageId}
          parentPackageName={parentPackageName}
          tripId={trip?.id || ''}
          onNavigateToTab={(tab) => { if (tab) setActiveTab(tab) }}
          onBooked={(_cascadedCount, confirmedDate) => {
            setIsBooked(true)
            setBookingDate(confirmedDate ? confirmedDate : new Date().toISOString().split('T')[0]!)
            queryClient.invalidateQueries({ queryKey: ['activities'] })
            queryClient.invalidateQueries({ queryKey: ['bookings'] })
            queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
          }}
          onUnbooked={() => {
            setIsBooked(false)
            setBookingDate(null)
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
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600 data-[state=active]:bg-transparent px-6 py-3"
          >
            General Info
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600 data-[state=active]:bg-transparent px-6 py-3"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600 data-[state=active]:bg-transparent px-6 py-3"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="booking"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600 data-[state=active]:bg-transparent px-6 py-3"
          >
            Booking & Pricing
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600 data-[state=active]:bg-transparent px-6 py-3"
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
                  Paste tour confirmation details or describe the tour, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste tour confirmation or describe the tour experience..."
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

          {/* Search Activities Section */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setShowActivitySearch(!showActivitySearch)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-orange-500" />
                <span className="font-medium">Search Tours</span>
                <span className="text-xs text-gray-400 ml-1">Tours & experiences nearby</span>
              </div>
              {showActivitySearch ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {showActivitySearch && (
              <div className="p-4 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-3">
                  Search for tours and activities near this location. Requires latitude/longitude coordinates.
                </p>
                <ActivitySearchPanel
                  onSelect={handleActivitySelect}
                  locations={searchLocations}
                />
              </div>
            )}
          </div>

          {/* Tour Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Tour Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="tourDetails.tourName">
                <label className="text-sm font-medium text-gray-700">Tour Name *</label>
                <Input
                  {...register('tourDetails.tourName')}
                  placeholder="e.g., Vatican City Walking Tour"
                />
                {errors.tourDetails?.tourName && (
                  <p className="text-sm text-red-600">{getErrorMessage(errors, 'tourDetails.tourName')}</p>
                )}
              </div>

              <div className="space-y-2" data-field="tourDetails.tourSubtype">
                <label className="text-sm font-medium text-gray-700">Tour Type</label>
                <Select
                  value={tourSubtypeValue || ''}
                  onValueChange={(v) => setValue('tourDetails.tourSubtype', v, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tour type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOUR_SUBTYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="tourDetails.location">
                <label className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  {...register('tourDetails.location')}
                  placeholder="e.g., Rome, Italy"
                />
              </div>

              <div className="space-y-2" data-field="confirmationNumber">
                <label className="text-sm font-medium text-gray-700">Confirmation Number</label>
                <Input
                  {...register('confirmationNumber')}
                  placeholder="Booking reference"
                />
              </div>
            </div>

            <div className="space-y-2" data-field="tourDetails.address">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Textarea
                {...register('tourDetails.address')}
                placeholder="Full tour location address"
                rows={2}
              />
            </div>

            <div className="space-y-2" data-field="tourDetails.meetingPoint">
              <label className="text-sm font-medium text-gray-700">Meeting Point</label>
              <Input
                {...register('tourDetails.meetingPoint')}
                placeholder="e.g., In front of St. Peter&apos;s Basilica"
              />
            </div>
          </div>

          {/* Tour Schedule */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Tour Schedule</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2" data-field="startDatetime">
                <label className="text-sm font-medium text-gray-700">Date</label>
                <DatePickerEnhanced
                  value={tourDateValue}
                  onChange={(v) => setValue('tourDetails.tourDate', v ?? '', { shouldDirty: true })}
                  placeholder="YYYY-MM-DD"
                  defaultMonthHint={tripMonthHint}
                />
                <TripDateWarning
                  date={tourDateValue}
                  tripStartDate={trip?.startDate}
                  tripEndDate={trip?.endDate}
                  fieldLabel="Tour date"
                />
                {pendingDay && (
                  <div className="mt-2">
                    {tourDateValue && matchedDay ? (
                      <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                        <Check className="h-4 w-4" />
                        This tour will be added to <strong>Day {matchedDay.dayNumber}</strong>
                      </p>
                    ) : tourDateValue && !matchedDay ? (
                      <p className="text-sm text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        No matching day found for this date
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="space-y-2" data-field="tourDetails.startTime">
                <label className="text-sm font-medium text-gray-700">Start Time</label>
                <TimePicker
                  value={startTimeValue}
                  onChange={(v) => setValue('tourDetails.startTime', v ?? '', { shouldDirty: true })}
                  placeholder="HH:MM"
                />
              </div>
              <div className="space-y-2" data-field="tourDetails.endTime">
                <label className="text-sm font-medium text-gray-700">End Time</label>
                <TimePicker
                  value={endTimeValue}
                  onChange={(v) => setValue('tourDetails.endTime', v ?? '', { shouldDirty: true })}
                  placeholder="HH:MM"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2" data-field="tourDetails.timezone">
                <label className="text-sm font-medium text-gray-700">Timezone</label>
                <Select
                  value={timezoneValue || ''}
                  onValueChange={(v) => setValue('tourDetails.timezone', v, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2" data-field="tourDetails.durationMinutes">
                <label className="text-sm font-medium text-gray-700">Duration (minutes)</label>
                <Input
                  type="number"
                  min={0}
                  value={durationMinutesValue ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      setValue('tourDetails.durationMinutes', null, { shouldDirty: true })
                    } else {
                      const num = parseInt(value, 10)
                      if (!isNaN(num) && num >= 0) {
                        setValue('tourDetails.durationMinutes', num, { shouldDirty: true })
                      }
                    }
                  }}
                  placeholder="e.g., 180"
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isOvernight"
                    checked={isOvernightValue || false}
                    onCheckedChange={(checked) =>
                      setValue('tourDetails.isOvernight', checked === true, { shouldDirty: true })
                    }
                  />
                  <label
                    htmlFor="isOvernight"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Overnight Tour
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Provider Information */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Provider Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="tourDetails.providerName">
                <label className="text-sm font-medium text-gray-700">Provider Name</label>
                <Input
                  {...register('tourDetails.providerName')}
                  placeholder="e.g., Walks of Italy"
                />
              </div>
              <div className="space-y-2" data-field="tourDetails.providerPhone">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  {...register('tourDetails.providerPhone')}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="tourDetails.providerEmail">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <Input
                  {...register('tourDetails.providerEmail')}
                  placeholder="contact@provider.com"
                  type="email"
                />
              </div>
              <div className="space-y-2" data-field="tourDetails.providerWebsite">
                <label className="text-sm font-medium text-gray-700">Website</label>
                <Input
                  {...register('tourDetails.providerWebsite')}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Inclusions, Exclusions, What to Bring */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold">Tour Details</h3>

            {/* Inclusions */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">What&apos;s Included</label>
              <div className="flex gap-2">
                <Input
                  value={inclusionInput}
                  onChange={(e) => setInclusionInput(e.target.value)}
                  placeholder="e.g., Skip-the-line tickets"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag('tourDetails.inclusions', inclusionInput)
                      setInclusionInput('')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    addTag('tourDetails.inclusions', inclusionInput)
                    setInclusionInput('')
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {inclusionsValue.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {inclusionsValue.map((item: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="pl-3 pr-1 py-1">
                      {item}
                      <button
                        type="button"
                        onClick={() => removeTag('tourDetails.inclusions', item)}
                        className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Exclusions */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">What&apos;s Not Included</label>
              <div className="flex gap-2">
                <Input
                  value={exclusionInput}
                  onChange={(e) => setExclusionInput(e.target.value)}
                  placeholder="e.g., Gratuities"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag('tourDetails.exclusions', exclusionInput)
                      setExclusionInput('')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    addTag('tourDetails.exclusions', exclusionInput)
                    setExclusionInput('')
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {exclusionsValue.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {exclusionsValue.map((item: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="pl-3 pr-1 py-1">
                      {item}
                      <button
                        type="button"
                        onClick={() => removeTag('tourDetails.exclusions', item)}
                        className="ml-2 hover:bg-gray-200 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* What to Bring */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">What to Bring</label>
              <div className="flex gap-2">
                <Input
                  value={whatToBringInput}
                  onChange={(e) => setWhatToBringInput(e.target.value)}
                  placeholder="e.g., Comfortable walking shoes"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag('tourDetails.whatToBring', whatToBringInput)
                      setWhatToBringInput('')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    addTag('tourDetails.whatToBring', whatToBringInput)
                    setWhatToBringInput('')
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {whatToBringValue.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {whatToBringValue.map((item: string, idx: number) => (
                    <Badge key={idx} variant="default" className="pl-3 pr-1 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200">
                      {item}
                      <button
                        type="button"
                        onClick={() => removeTag('tourDetails.whatToBring', item)}
                        className="ml-2 hover:bg-blue-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Special Requests */}
          <div className="space-y-2 pt-4 border-t" data-field="tourDetails.specialRequests">
            <label className="text-sm font-medium text-gray-700">Special Requests</label>
            <Textarea
              {...register('tourDetails.specialRequests')}
              placeholder="Any special requirements or requests..."
              className="min-h-[100px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2" data-field="description">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              {...register('description')}
              placeholder="Add a description for this tour..."
              className="min-h-[100px]"
            />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="activity"
              itineraryId={itineraryId}
              title="Tour Photos"
              description="Tour photos and images"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the tour first to upload media.</p>
              <p className="text-sm mt-1">Media will be available after the tour is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the tour first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the tour is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="booking" className="mt-6 space-y-6">
          {/* Pricing Section */}
          <PricingSection
            pricingData={pricingData}
            onUpdate={(updates) => {
              if ('pricingBreakdown' in updates) {
                setPricingBreakdown(updates.pricingBreakdown ?? null)
              }
              Object.entries(updates).forEach(([key, value]) => {
                if (key === 'pricingBreakdown') return
                setValue(key as keyof TourFormData, value as any, { shouldDirty: true, shouldValidate: true })
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
                setValue(key as keyof TourFormData, value as any, { shouldDirty: true, shouldValidate: true })
              })
            }}
            onSupplierDefaultsApplied={(defaults: SupplierDefaults) => {
              setSupplierCommissionRate(defaults.commissionRate)
            }}
            onNavigateToTab={(tab) => setActiveTab(tab as any)}
            bookingDate={bookingDate}
            onBookingDateChange={setBookingDate}
          />

          <Separator />

          {/* Commission Section */}
          <CommissionSection
            pricingData={pricingData}
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([key, value]) => {
                setValue(key as keyof TourFormData, value as any, { shouldDirty: true, shouldValidate: true })
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
        <Button
          onClick={handleSubmit}
          disabled={createTour.isPending || updateTour.isPending}
          className="bg-orange-600 hover:bg-orange-700"
        >
          {(createTour.isPending || updateTour.isPending) ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Tour'}
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
