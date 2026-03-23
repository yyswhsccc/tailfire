'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSaveStatus } from '@/hooks/use-save-status'
import { useActivityNameGenerator } from '@/hooks/use-activity-name-generator'
import { FormSuccessOverlay } from '@/components/ui/form-success-overlay'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Anchor, ChevronDown, ChevronUp, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { useCreatePortInfo, useUpdatePortInfo, usePortInfo } from '@/hooks/use-port-info'
import { useQueryClient } from '@tanstack/react-query'
import { BookingHeaderButton } from '@/components/activities/booking-header-button'
import { EditTravelersDialog } from './edit-travelers-dialog'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TimePicker } from '@/components/ui/time-picker'
import { DocumentUploader } from '@/components/document-uploader'
import { ComponentMediaTab } from '@/components/shared'
import { ActivityCommentsPanel } from '@/components/activities/activity-comments-panel'
import {
  portInfoFormSchema,
  toPortInfoDefaults,
  toPortInfoApiPayload,
  type PortInfoFormData,
} from '@/lib/validation/port-info-validation'
import { getErrorMessage, scrollToFirstError } from '@/lib/validation/utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { getDefaultMonthHint } from '@/lib/date-utils'
import { usePendingDayResolution } from '@/components/ui/pending-day-picker'

interface PortInfoFormProps {
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
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export function PortInfoForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  trip,
  onSuccess: _onSuccess,
  onCancel,
  pendingDay,
  days = [],
}: PortInfoFormProps) {
  const { toast } = useToast()
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
  // Port info form has no booking tab, always default to general
  const [activeTab, setActiveTab] = useState('general')

  // Track activity ID (for create->update transition)
  const [activityId, setActivityId] = useState<string | null>(activity?.id || null)

  // Safety net refs to prevent duplicate creation race condition
  const activityIdRef = useRef<string | null>(activity?.id || null)
  const createInProgressRef = useRef(false)

  // Booking status state
  const [showSuccess, setShowSuccess] = useState(false)
  const { returnToItinerary } = useActivityNavigation()
  const [activityIsBooked, setActivityIsBooked] = useState(activity?.bookingStatus === 'booked')
  const [activityBookingDate, setActivityBookingDate] = useState<string | null>(activity?.bookingDate ?? null)
  const queryClient = useQueryClient()

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

  // Setup react-hook-form with Zod validation
  const form = useForm<PortInfoFormData>({
    resolver: zodResolver(portInfoFormSchema),
    defaultValues: toPortInfoDefaults({ itineraryDayId: dayId }, dayDate),
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

  // useWatch for custom components (Selects, DatePickers, TimePickers, Checkbox)
  const statusValue = useWatch({ control, name: 'proposalStatus' })
  const arrivalDateValue = useWatch({ control, name: 'portInfoDetails.arrivalDate' })
  const departureDateValue = useWatch({ control, name: 'portInfoDetails.departureDate' })
  const arrivalTimeValue = useWatch({ control, name: 'portInfoDetails.arrivalTime' })
  const departureTimeValue = useWatch({ control, name: 'portInfoDetails.departureTime' })
  const tenderRequiredValue = useWatch({ control, name: 'portInfoDetails.tenderRequired' })

  // Watch all form values for auto-save
  const watchedValues = useWatch({ control })
  // Create stable string representation for dependency comparison
  // useWatch returns new object reference every render - JSON.stringify creates stable primitive
  const watchedValuesKey = useMemo(() => JSON.stringify(watchedValues), [watchedValues])
  const portNameValue = useWatch({ control, name: 'portInfoDetails.portName' })

  // Auto-generate activity name from port name
  const { displayName, placeholder } = useActivityNameGenerator({
    activityType: 'port_info',
    control,
    setValue,
    portName: portNameValue,
  })

  // Fetch port info data (for edit mode)
  const { data: portInfoData } = usePortInfo(activityId || '')

  // Trip month hint for date picker calendar default
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(trip?.startDate),
    [trip?.startDate]
  )

  // Derive dayId from arrival date in pendingDay mode
  const { computedDayId, matchedDay } = usePendingDayResolution(days, arrivalDateValue)
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

  // Auto-populate arrival date from day context (only for new activities)
  // Uses watched arrivalDateValue to ensure effect reruns when form initializes
  // effectiveDayDate handles async loading: derives date from days prop if dayDate is undefined
  useEffect(() => {
    if (isEditing) return
    if (dayDateAppliedRef.current) return
    if (!effectiveDayDate) return
    // Only set if date field is empty
    if (!arrivalDateValue) {
      dayDateAppliedRef.current = true
      setValue('portInfoDetails.arrivalDate', effectiveDayDate, { shouldDirty: false })
    }
  }, [effectiveDayDate, isEditing, arrivalDateValue, setValue])

  // Mutations - use effectiveDayId for pendingDay mode
  const createPortInfo = useCreatePortInfo(itineraryId, effectiveDayId)
  const updatePortInfo = useUpdatePortInfo(itineraryId, effectiveDayId)

  // Ref to track loaded port info ID
  const portInfoIdRef = useRef<string | null>(null)

  // Smart re-seeding: only when port info ID actually changes
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (portInfoData && portInfoData.id !== portInfoIdRef.current) {
      portInfoIdRef.current = portInfoData.id

      setActivityId(portInfoData.id)

      // Reset form with loaded data - map nullable server fields to form types
      const details = portInfoData.portInfoDetails
      const serverData: Partial<PortInfoFormData> = {
        itineraryDayId: dayId,
        name: portInfoData.name,
        description: portInfoData.description || '',
        proposalStatus: portInfoData.proposalStatus as PortInfoFormData['proposalStatus'],
        portInfoDetails: details ? {
          portName: details.portName || '',
          portLocation: details.portLocation || '',
          arrivalTime: details.arrivalTime || '',
          departureTime: details.departureTime || '',
          timezone: details.timezone || '',
          dockName: details.dockName || '',
          address: details.address || '',
          phone: details.phone || '',
          website: details.website || '',
          excursionNotes: details.excursionNotes || '',
          tenderRequired: details.tenderRequired ?? false,
          specialRequests: details.specialRequests || '',
          arrivalDate: details.arrivalDate || null,
          departureDate: details.departureDate || null,
          coordinates: details.coordinates || null,
        } : undefined,
      }

      const defaults = toPortInfoDefaults(serverData, dayDate)

      // Use queueMicrotask to defer form reset outside React's render cycle
      queueMicrotask(() => {
        if (!cancelled) {
          reset(defaults, { keepDirty: false })
        }
      })
    }

    // Cleanup: mark cancelled to prevent stale microtask execution
    return () => {
      cancelled = true
    }
  }, [portInfoData, dayId, dayDate, reset])

  // Auto-save effect with validation gating
  useEffect(() => {
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Gate auto-save on validation state
    if (!isDirty || !isValid || isValidating || isSubmitting || createPortInfo.isPending || updatePortInfo.isPending) {
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
        const payload = toPortInfoApiPayload(formData)

        // Use ref for immediate check (state may be stale)
        if (activityId || activityIdRef.current) {
          // Update existing
          const id = activityId || activityIdRef.current!
          await updatePortInfo.mutateAsync({ id, data: payload.portInfoDetails || {} })
        } else {
          // Mark create as in progress before API call
          createInProgressRef.current = true
          try {
            // Create new
            const result = await createPortInfo.mutateAsync(payload)
            if (result?.id) {
              // Update ref immediately (synchronous) before React state update
              activityIdRef.current = result.id
              setActivityId(result.id)
            }
          } finally {
            createInProgressRef.current = false
          }
        }

        setAutoSaveStatus('saved')
        setLastSavedAt(new Date())
      } catch (err: any) {
        setAutoSaveStatus('error')
        toast({
          title: 'Auto-save failed',
          description: err.message || 'Failed to save port information',
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
    getValues,
    createPortInfo,
    updatePortInfo,
    toast,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  // Force save function
  const forceSave = useCallback(async () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Validate before saving
    const isFormValid = await form.trigger()
    if (!isFormValid) {
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
      const payload = toPortInfoApiPayload(formData)

      if (activityId) {
        await updatePortInfo.mutateAsync({ id: activityId, data: payload.portInfoDetails || {} })
      } else {
        const result = await createPortInfo.mutateAsync(payload)
        if (result?.id) {
          setActivityId(result.id)
        }
      }

      setAutoSaveStatus('saved')
      setLastSavedAt(new Date())

      // Show success overlay and redirect
      setShowSuccess(true)
    } catch (err: any) {
      setAutoSaveStatus('error')
      toast({
        title: 'Save failed',
        description: err.message || 'Failed to save port information',
        variant: 'destructive',
      })
    }
  }, [
    form,
    errors,
    activityId,
    getValues,
    createPortInfo,
    updatePortInfo,
    toast,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  const handleAiSubmit = () => {
    toast({
      title: 'AI Assist',
      description: 'Processing port information...',
    })
    setAiInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await forceSave()
  }

  // Get travelers from trip data
  const travelers = trip?.travelers || []
  const totalTravelers = trip?.travelers?.length || 0

  return (
    <div className="relative max-w-5xl">
      <FormSuccessOverlay
        show={showSuccess}
        message={isEditing ? 'Port Info Updated!' : 'Port Info Added!'}
        onComplete={returnToItinerary}
        onDismiss={() => setShowSuccess(false)}
        duration={1000}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Port Info Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-blue-500 rounded-lg flex items-center justify-center">
          <Anchor className="h-8 w-8 text-white" />
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
            <div className="flex items-center gap-2" data-field="status">
              <span className="text-sm text-gray-600">Status</span>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('proposalStatus', v as PortInfoFormData['proposalStatus'], { shouldDirty: true })}
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

        {/* Booking Button */}
        <BookingHeaderButton
          activityId={activityId}
          activityName={watchedValues.portInfoDetails?.portName || 'Port Info'}
          activityType="port_info"
          isBooked={activityIsBooked}
          bookingDate={activityBookingDate}
          isChildOfPackage={false}
          tripId={trip?.id || ''}
          onNavigateToTab={(tab) => { if (tab) setActiveTab(tab === 'pricing' ? 'booking' : tab) }}
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

      {/* Tabbed Interface - No Booking tab for port_info */}
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
            Booking Status
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
                  Paste port details or cruise itinerary information, and let AI Assist fill in the fields.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Paste port information or cruise itinerary details..."
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

          {/* Port Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Port Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="portInfoDetails.portName">
                <label className="text-sm font-medium text-gray-700">Port Name *</label>
                <Input
                  {...register('portInfoDetails.portName')}
                  placeholder="e.g., Port of Nassau"
                />
                {getErrorMessage(errors, 'portInfoDetails.portName') && (
                  <p className="text-sm text-red-500">{getErrorMessage(errors, 'portInfoDetails.portName')}</p>
                )}
              </div>

              <div className="space-y-2" data-field="portInfoDetails.portLocation">
                <label className="text-sm font-medium text-gray-700">Port Location</label>
                <Input
                  {...register('portInfoDetails.portLocation')}
                  placeholder="e.g., Nassau, Bahamas"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="portInfoDetails.dockName">
                <label className="text-sm font-medium text-gray-700">Dock Name</label>
                <Input
                  {...register('portInfoDetails.dockName')}
                  placeholder="e.g., Prince George Wharf"
                />
              </div>

              <div className="space-y-2" data-field="portInfoDetails.timezone">
                <label className="text-sm font-medium text-gray-700">Timezone</label>
                <Input
                  {...register('portInfoDetails.timezone')}
                  placeholder="e.g., America/Nassau"
                />
              </div>
            </div>
          </div>

          {/* Arrival & Departure */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Arrival & Departure</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="startDatetime">
                <label className="text-sm font-medium text-gray-700">Arrival Date</label>
                <DatePickerEnhanced
                  value={arrivalDateValue || undefined}
                  onChange={(date) => setValue('portInfoDetails.arrivalDate', date ?? null, { shouldDirty: true })}
                  placeholder="Select arrival date"
                  defaultMonthHint={tripMonthHint}
                />
                <TripDateWarning
                  date={arrivalDateValue}
                  tripStartDate={trip?.startDate}
                  tripEndDate={trip?.endDate}
                  fieldLabel="Arrival date"
                />
                {/* Day assignment feedback for pendingDay mode */}
                {pendingDay && (
                  <div className="mt-2">
                    {arrivalDateValue && matchedDay ? (
                      <p className="text-sm text-phoenix-gold-700 flex items-center gap-1.5">
                        <Check className="h-4 w-4" />
                        This port info will be added to <strong>Day {matchedDay.dayNumber}</strong>
                      </p>
                    ) : arrivalDateValue && !matchedDay ? (
                      <p className="text-sm text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        No matching day found for this date
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-2" data-field="portInfoDetails.arrivalTime">
                <label className="text-sm font-medium text-gray-700">Arrival Time</label>
                <TimePicker
                  value={arrivalTimeValue || undefined}
                  onChange={(time) => setValue('portInfoDetails.arrivalTime', time ?? '', { shouldDirty: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="endDatetime">
                <label className="text-sm font-medium text-gray-700">Departure Date</label>
                <DatePickerEnhanced
                  value={departureDateValue || undefined}
                  onChange={(date) => setValue('portInfoDetails.departureDate', date ?? null, { shouldDirty: true })}
                  placeholder="Select departure date"
                  defaultMonthHint={tripMonthHint}
                />
                <TripDateWarning
                  date={departureDateValue}
                  tripStartDate={trip?.startDate}
                  tripEndDate={trip?.endDate}
                  fieldLabel="Departure date"
                />
              </div>

              <div className="space-y-2" data-field="portInfoDetails.departureTime">
                <label className="text-sm font-medium text-gray-700">Departure Time</label>
                <TimePicker
                  value={departureTimeValue || undefined}
                  onChange={(time) => setValue('portInfoDetails.departureTime', time ?? '', { shouldDirty: true })}
                />
              </div>
            </div>
          </div>

          {/* Contact & Address */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Contact & Address</h3>

            <div className="space-y-2" data-field="portInfoDetails.address">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Textarea
                {...register('portInfoDetails.address')}
                placeholder="Full port address"
                className="min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-field="portInfoDetails.phone">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  {...register('portInfoDetails.phone')}
                  placeholder="Port contact number"
                />
              </div>

              <div className="space-y-2" data-field="portInfoDetails.website">
                <label className="text-sm font-medium text-gray-700">Website</label>
                <Input
                  {...register('portInfoDetails.website')}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Shore Excursions & Notes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Shore Excursions & Notes</h3>

            <div className="flex items-center space-x-2" data-field="portInfoDetails.tenderRequired">
              <Checkbox
                id="tenderRequired"
                checked={tenderRequiredValue || false}
                onCheckedChange={(checked) => setValue('portInfoDetails.tenderRequired', checked === true, { shouldDirty: true })}
              />
              <label
                htmlFor="tenderRequired"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Tender required (ship anchors offshore)
              </label>
            </div>

            <div className="space-y-2" data-field="portInfoDetails.excursionNotes">
              <label className="text-sm font-medium text-gray-700">Excursion Notes</label>
              <Textarea
                {...register('portInfoDetails.excursionNotes')}
                placeholder="Notes about shore excursions, activities, or local attractions..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2" data-field="portInfoDetails.specialRequests">
              <label className="text-sm font-medium text-gray-700">Special Requests</label>
              <Textarea
                {...register('portInfoDetails.specialRequests')}
                placeholder="Any special requirements or notes..."
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">
              Save Port Info
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-6">
          {activityId ? (
            <ComponentMediaTab
              componentId={activityId}
              entityType="port_info"
              itineraryId={itineraryId}
              title="Port Photos"
              description="Port images, maps, and location photos"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the port information first to upload media.</p>
              <p className="text-sm mt-1">Media will be available after the port information is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {activityId ? (
            <DocumentUploader componentId={activityId} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Save the port information first to upload documents.</p>
              <p className="text-sm mt-1">Documents will be available after the port information is created.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="booking" className="mt-6">
          <div className="text-center py-12 text-gray-500">
            <p>Use the booking button in the header to manage booking status.</p>
          </div>
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
