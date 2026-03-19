'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, X, Image as ImageIcon, FileText, CalendarDays, AlertCircle, Package } from 'lucide-react'
import type { ActivityResponseDto, ItineraryDayWithActivitiesDto, CreateActivityDto } from '@tailfire/shared-types/api'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { useToast } from '@/hooks/use-toast'
import { useCreateActivity, useUpdateActivity } from '@/hooks/use-activities'
import { ComponentMediaTab } from '@/components/shared'
import { DocumentUploader } from '@/components/document-uploader'
import {
  activityFormSchema,
  toActivityDefaults,
  toActivityApiPayload,
  type ActivityFormData,
} from '@/lib/validation/activity-validation'
import { getErrorMessage, scrollToFirstError } from '@/lib/validation/utils'
import { findDayForDate, getDefaultMonthHint } from '@/lib/date-utils'
import { TripDateWarning } from '@/components/ui/trip-date-warning'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { itineraryDayKeys } from '@/hooks/use-itinerary-days'
import { activityKeys } from '@/hooks/use-activities'
import { useBooking, useUnlinkActivities, bookingKeys } from '@/hooks/use-bookings'

interface ActivityFormProps {
  itineraryId: string
  dayId: string
  dayDate?: string | null
  activity?: ActivityResponseDto
  initialActivityType?: string
  initialName?: string
  onSuccess?: () => void
  onCancel?: () => void
  // Pending day mode props
  pendingDay?: boolean
  days?: ItineraryDayWithActivitiesDto[]
  // Trip date range for validation warnings
  tripStartDate?: string | null
  tripEndDate?: string | null
}

const ACTIVITY_TYPES = [
  { value: 'lodging', label: 'Lodging' },
  { value: 'flight', label: 'Flight' },
  { value: 'tour', label: 'Tour' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'dining', label: 'Dining' },
  { value: 'options', label: 'Options' },
  { value: 'custom_cruise', label: 'Cruise' },
  { value: 'port_info', label: 'Port Info' },
] as const

const STATUSES = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const PRICING_TYPES = [
  { value: 'per_person', label: 'Per Person' },
  { value: 'per_room', label: 'Per Room' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'per_night', label: 'Per Night' },
] as const

export function ActivityForm({
  itineraryId,
  dayId,
  dayDate,
  activity,
  initialActivityType,
  initialName,
  onSuccess,
  onCancel,
  pendingDay = false,
  days = [],
  tripStartDate,
  tripEndDate,
}: ActivityFormProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const isEditing = !!activity

  // Get tripId from route params (with guard)
  const params = useParams()
  const tripId = (params?.id as string) || ''

  // Fetch package info if activity is linked (handles 404 gracefully)
  const { data: linkedBooking, isError: bookingError } = useBooking(activity?.packageId ?? null)
  const unlinkMutation = useUnlinkActivities()

  // Determine if package was deleted (activity has bookingId but fetch failed)
  const packageDeleted = activity?.packageId && bookingError

  // Pending day mode state
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null)

  // Calculate the resolved day from the selected date (pendingDay mode only)
  const resolvedDay = useMemo(() => {
    if (!pendingDay || !selectedActivityDate || days.length === 0) {
      return null
    }
    return findDayForDate(selectedActivityDate, days)
  }, [pendingDay, selectedActivityDate, days])

  // Get date range for pendingDay picker
  const dateRange = useMemo(() => {
    if (!pendingDay || days.length === 0) return { minDate: undefined, maxDate: undefined }
    const datesWithValues = days.filter(d => d.date).map(d => d.date as string).sort()
    return {
      minDate: datesWithValues[0],
      maxDate: datesWithValues[datesWithValues.length - 1],
    }
  }, [pendingDay, days])

  // Trip month hint for date picker calendar default
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(tripStartDate),
    [tripStartDate]
  )

  // Setup react-hook-form with Zod validation
  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: toActivityDefaults(null, dayDate, initialActivityType, initialName),
    mode: 'onSubmit', // Validate on submit to avoid render-time Controller issues
  })

  const {
    control,
    register,
    reset,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  // useWatch for custom components (Selects and datetime inputs that need null handling)
  const activityTypeValue = useWatch({ control, name: 'activityType' })
  const statusValue = useWatch({ control, name: 'status' })
  const pricingTypeValue = useWatch({ control, name: 'pricingType' })
  const startDatetimeValue = useWatch({ control, name: 'startDatetime' })
  const endDatetimeValue = useWatch({ control, name: 'endDatetime' })

  // Hydrate form when activity data is available (edit mode)
  // Uses queueMicrotask to defer form reset outside React's render cycle,
  // preventing "Cannot update a component while rendering" warnings
  useEffect(() => {
    // Guard: cleanup flag to prevent microtask running after unmount
    let cancelled = false

    if (activity) {
      const serverData: Partial<ActivityFormData> = {
        activityType: activity.activityType as ActivityFormData['activityType'],
        name: activity.name,
        description: activity.description || '',
        location: activity.location || '',
        address: activity.address || '',
        confirmationNumber: activity.confirmationNumber || '',
        status: activity.status as ActivityFormData['status'],
        pricingType: activity.pricingType as ActivityFormData['pricingType'],
        currency: activity.currency || 'USD',
        notes: activity.notes || '',
        startDatetime: activity.startDatetime || null,
        endDatetime: activity.endDatetime || null,
      }

      const defaults = toActivityDefaults(serverData, dayDate, initialActivityType, initialName)

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
  }, [activity, dayDate, initialActivityType, initialName, reset])

  // Standard hooks for non-pendingDay mode
  const createActivity = useCreateActivity(itineraryId, dayId)
  const updateActivity = useUpdateActivity(itineraryId, dayId)

  // Direct mutation for pendingDay mode (dayId determined at submit time)
  const createActivityForDay = useMutation({
    mutationFn: ({ targetDayId, data }: { targetDayId: string; data: Omit<CreateActivityDto, 'itineraryDayId'> }) =>
      api.post<ActivityResponseDto>(`/days/${targetDayId}/activities`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(variables.targetDayId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
    },
  })

  const onSubmit = async (data: ActivityFormData) => {
    try {
      // For pendingDay mode, validate we have a resolved day
      if (pendingDay) {
        if (!selectedActivityDate) {
          toast({
            title: 'Date required',
            description: 'Please select a date for this activity.',
            variant: 'destructive',
          })
          return
        }
        if (!resolvedDay) {
          toast({
            title: 'Invalid date',
            description: 'The selected date does not match any day in this itinerary.',
            variant: 'destructive',
          })
          return
        }
      }

      const targetDayId = pendingDay ? resolvedDay!.dayId : dayId

      if (isEditing) {
        const payload = toActivityApiPayload(data, targetDayId)
        await updateActivity.mutateAsync({
          id: activity.id,
          data: payload,
        })

        toast({
          title: 'Activity updated',
          description: 'The activity has been updated successfully.',
        })
      } else if (pendingDay) {
        // pendingDay mode: omit itineraryDayId from body (dayId is in URL path)
        const payload = toActivityApiPayload(data, targetDayId, { omitDayId: true })

        await createActivityForDay.mutateAsync({
          targetDayId,
          data: payload,
        })

        toast({
          title: 'Activity created',
          description: `Activity added to Day ${resolvedDay!.dayNumber}.`,
        })
      } else {
        const payload = toActivityApiPayload(data, targetDayId)
        await createActivity.mutateAsync(payload)

        toast({
          title: 'Activity created',
          description: 'The activity has been added to the day.',
        })
      }

      onSuccess?.()
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'create'} activity. Please try again.`,
        variant: 'destructive',
      })
    }
  }

  const onError = () => {
    scrollToFirstError(errors)
    toast({
      title: 'Validation Error',
      description: 'Please fix the errors below.',
      variant: 'destructive',
    })
  }

  // Check if form can be submitted (for pendingDay mode)
  const canSubmit = pendingDay ? !!resolvedDay : true
  const isPending = isSubmitting || createActivity.isPending || updateActivity.isPending || createActivityForDay.isPending

  // Handler to unlink activity from package
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
      // Surface specific API validation errors (e.g., same-trip guard returns 400)
      const message = error instanceof Error ? error.message : 'Failed to unlink activity from package.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    }
  }

  return (
    <Tabs defaultValue="details" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="media" className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          Media
        </TabsTrigger>
        <TabsTrigger value="documents" className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Documents
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details">
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

        <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-6">
          {/* Pending Day Date Picker - shown when day is not predetermined */}
          {pendingDay && (
            <div className="p-4 bg-phoenix-gold-50 border border-phoenix-gold-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CalendarDays className="h-5 w-5 text-phoenix-gold-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm font-medium text-ash-900 block mb-2">
                    Activity Date *
                  </label>
                  <DatePickerEnhanced
                    value={selectedActivityDate}
                    onChange={setSelectedActivityDate}
                    minDate={dateRange.minDate}
                    maxDate={dateRange.maxDate}
                    placeholder="Select a date for this activity"
                    defaultMonthHint={tripMonthHint}
                  />
                  {/* Day resolution feedback */}
                  {selectedActivityDate && resolvedDay && (
                    <p className="text-sm text-phoenix-gold-700 mt-2 flex items-center gap-1.5">
                      <Check className="h-4 w-4" />
                      This activity will be added to <strong>Day {resolvedDay.dayNumber}</strong>
                    </p>
                  )}
                  {selectedActivityDate && !resolvedDay && (
                    <p className="text-sm text-amber-600 mt-2 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      No matching day found for this date. Please select a date within the itinerary range.
                    </p>
                  )}
                  {!selectedActivityDate && (
                    <p className="text-xs text-ash-500 mt-1">
                      Select a date to determine which day this activity will be assigned to.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activity Type and Name */}
          <div className="grid grid-cols-2 gap-4">
            <div data-field="activityType">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Type *
              </label>
              <Select
                value={activityTypeValue}
                onValueChange={(v) => setValue('activityType', v as ActivityFormData['activityType'], { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getErrorMessage(errors, 'activityType') && (
                <p className="text-sm text-red-500 mt-1">{getErrorMessage(errors, 'activityType')}</p>
              )}
            </div>

            <div data-field="name">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Name *
              </label>
              <Input
                {...register('name')}
                placeholder="e.g., Hilton Paris, Flight to Rome"
              />
              {getErrorMessage(errors, 'name') && (
                <p className="text-sm text-red-500 mt-1">{getErrorMessage(errors, 'name')}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div data-field="description">
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Description
            </label>
            <Textarea
              {...register('description')}
              placeholder="Brief description of the activity"
              rows={3}
            />
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div data-field="startDatetime">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Start Time
              </label>
              <Input
                type="datetime-local"
                value={startDatetimeValue || ''}
                onChange={(e) => setValue('startDatetime', e.target.value || null, { shouldDirty: true })}
              />
              <TripDateWarning
                date={startDatetimeValue}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                fieldLabel="Start time"
              />
            </div>
            <div data-field="endDatetime">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                End Time
              </label>
              <Input
                type="datetime-local"
                value={endDatetimeValue || ''}
                onChange={(e) => setValue('endDatetime', e.target.value || null, { shouldDirty: true })}
              />
              <TripDateWarning
                date={endDatetimeValue}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                fieldLabel="End time"
              />
              {getErrorMessage(errors, 'endDatetime') && (
                <p className="text-sm text-red-500 mt-1">{getErrorMessage(errors, 'endDatetime')}</p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div data-field="location">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Location
              </label>
              <Input
                {...register('location')}
                placeholder="City or venue name"
              />
            </div>
            <div data-field="address">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Address
              </label>
              <Input
                {...register('address')}
                placeholder="Full address"
              />
            </div>
          </div>

          {/* Status and Confirmation */}
          <div className="grid grid-cols-2 gap-4">
            <div data-field="status">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Status
              </label>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('status', v as ActivityFormData['status'], { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div data-field="confirmationNumber">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Supplier Booking Ref
              </label>
              <Input
                {...register('confirmationNumber')}
                placeholder="PNR, reservation #, booking #..."
              />
            </div>
          </div>

          {/* Pricing Metadata - pricing values managed via activity_pricing table */}
          <div className="grid grid-cols-2 gap-4">
            <div data-field="pricingType">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Pricing Type
              </label>
              <Select
                value={pricingTypeValue}
                onValueChange={(v) => setValue('pricingType', v as ActivityFormData['pricingType'], { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div data-field="currency">
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Currency
              </label>
              <Input
                {...register('currency')}
                placeholder="USD"
                maxLength={3}
              />
              {getErrorMessage(errors, 'currency') && (
                <p className="text-sm text-red-500 mt-1">{getErrorMessage(errors, 'currency')}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div data-field="notes">
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Notes
            </label>
            <Textarea
              {...register('notes')}
              placeholder="Additional notes or instructions"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-6 border-t">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isPending || !canSubmit}
              className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
              title={pendingDay && !canSubmit ? 'Select a valid date first' : undefined}
            >
              <Check className="h-4 w-4 mr-2" />
              {isEditing ? 'Save Changes' : 'Add Activity'}
            </Button>
          </div>
        </form>
      </TabsContent>

      {/* Media Tab */}
      <TabsContent value="media" className="space-y-4">
        {isEditing && activity ? (
          <ComponentMediaTab
            componentId={activity.id}
            entityType="activity"
            itineraryId={itineraryId}
            title="Activity Photos"
            description="Images and photos for this activity"
          />
        ) : (
          <div className="text-center py-12 text-ash-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Save the activity first to upload media</p>
          </div>
        )}
      </TabsContent>

      {/* Documents Tab */}
      <TabsContent value="documents" className="space-y-4">
        {isEditing && activity ? (
          <DocumentUploader resourceId={activity.id} />
        ) : (
          <div className="text-center py-12 text-ash-500">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Save the activity first to upload documents</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
