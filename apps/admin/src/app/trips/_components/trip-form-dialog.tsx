import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Search, Trash2 } from 'lucide-react'
import type { TripResponseDto, ItineraryResponseDto, ItineraryDayResponseDto } from '@tailfire/shared-types/api'
import { useLoading } from '@/context/loading-context'
import { itineraryDayKeys } from '@/hooks/use-itinerary-days'
import { itineraryKeys } from '@/hooks/use-itineraries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangeInput } from '@/components/ui/date-range-input'
import { useCreateTrip, useUpdateTrip, tripKeys } from '@/hooks/use-trips'
import { useTripTags, useUpdateTripTags, useCreateTag } from '@/hooks/use-tags'
import { useToast } from '@/hooks/use-toast'
import { ApiError, api } from '@/lib/api'
import { TagInput } from '@/components/ui/tag-input'
import { UnsplashPicker } from '@/components/unsplash-picker'
import {
  tripFormSchema,
  toTripDefaults,
  toTripApiPayload,
  TRIP_FORM_FIELDS,
  mapServerErrors,
  scrollToFirstError,
  type TripFormValues,
} from '@/lib/validation'

// Type for selected Unsplash photo
interface SelectedCoverPhoto {
  id: string
  previewUrl: string
  downloadLocation: string
  photographerName: string
  photographerUrl: string
}

interface TripFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  trip?: TripResponseDto
}

export function TripFormDialog({
  open,
  onOpenChange,
  mode,
  trip,
}: TripFormDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [rootError, setRootError] = useState<string | null>(null)
  const [coverPhoto, setCoverPhoto] = useState<SelectedCoverPhoto | null>(null)
  const [showUnsplashPicker, setShowUnsplashPicker] = useState(false)
  const [savingCover, setSavingCover] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // Tag hooks for junction-based tag management
  const { data: existingTripTags } = useTripTags(mode === 'edit' && trip ? trip.id : null)
  const updateTripTags = useUpdateTripTags()
  const createTag = useCreateTag()
  const { startLoading, stopLoading, isLoading } = useLoading()
  const isNavigating = isLoading('trip-navigation')

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: toTripDefaults(),
  })

  const createTrip = useCreateTrip()
  const updateTrip = useUpdateTrip()
  const { toast } = useToast()

  // Reset form when trip changes or dialog opens
  useEffect(() => {
    if (open) {
      setRootError(null)
      setCoverPhoto(null)
      setShowUnsplashPicker(false)
      setSavingCover(false)
      stopLoading('trip-navigation')
      if (trip && mode === 'edit') {
        form.reset(toTripDefaults(trip))
      } else if (mode === 'create') {
        form.reset(toTripDefaults())
        setSelectedTagIds([])
      }
    }
  }, [trip, mode, form, open, stopLoading])

  // Sync tag IDs from junction data when it loads (handles async fetch)
  useEffect(() => {
    if (open && mode === 'edit' && existingTripTags) {
      setSelectedTagIds(existingTripTags.map(t => t.id))
    }
  }, [open, mode, existingTripTags])

  // Scroll to first error on validation failure
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      scrollToFirstError(form.formState.errors)
    }
  }, [form.formState.errors])

  const onSubmit = async (data: TripFormValues) => {
    setRootError(null)

    try {
      const payload = toTripApiPayload(data)

      if (mode === 'create') {
        const newTrip = await createTrip.mutateAsync(payload)

        // Save cover photo if selected
        if (coverPhoto) {
          setSavingCover(true)
          try {
            await api.post(`/trips/${newTrip.id}/media/external`, {
              unsplashPhotoId: coverPhoto.id,
              downloadLocation: coverPhoto.downloadLocation,
              isCoverPhoto: true,
            })
            // Invalidate trips list and detail so cover photo shows immediately
            queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
            queryClient.invalidateQueries({ queryKey: tripKeys.detail(newTrip.id) })
          } catch (coverError) {
            // Cover photo failed but trip was created - don't block success
            console.warn('Failed to save cover photo:', coverError)
            toast({
              title: 'Cover photo not saved',
              description: 'The trip was created, but the cover photo could not be saved. You can add it later from the Media tab.',
              variant: 'destructive',
            })
          } finally {
            setSavingCover(false)
          }
        }

        // Save tags via junction endpoint
        if (selectedTagIds.length > 0) {
          try {
            await updateTripTags.mutateAsync({ tripId: newTrip.id, tagIds: selectedTagIds })
          } catch (tagError) {
            console.warn('Failed to save tags:', tagError)
          }
        }

        startLoading('trip-navigation', 'Opening your new trip...')
        toast({
          title: 'Trip created',
          description: 'Redirecting to your new trip...',
        })
        onOpenChange(false)
        form.reset(toTripDefaults())
        setCoverPhoto(null)
        setSelectedTagIds([])
        // Navigate to the new trip's detail page
        router.push(`/trips/${newTrip.id}`)
      } else if (trip) {
        const oldStartDate = trip.startDate
        const oldEndDate = trip.endDate
        const newStartDate = payload.startDate
        const newEndDate = payload.endDate
        const hadDates = !!(oldStartDate && oldEndDate)
        const hasDates = !!(newStartDate && newEndDate)

        await updateTrip.mutateAsync({
          id: trip.id,
          data: payload,
        })

        // Save tags via junction endpoint
        await updateTripTags.mutateAsync({ tripId: trip.id, tagIds: selectedTagIds })

        // Auto-extend itinerary days if trip dates were added or extended
        // Need to fetch full trip details since list view doesn't include itineraries
        console.log('[DEBUG] Trip update complete. hasDates:', hasDates, 'hadDates:', hadDates)
        if (hasDates) {
          try {
            console.log('[DEBUG] Fetching itineraries for trip...')
            const itineraries = await api.get<ItineraryResponseDto[]>(`/trips/${trip.id}/itineraries`)
            console.log('[DEBUG] Found itineraries:', itineraries.length, itineraries.map(i => ({ id: i.id, name: i.name, startDate: i.startDate, endDate: i.endDate })))

            for (const itinerary of itineraries) {
              // Case 1: Trip didn't have dates before, now it does → auto-generate
              // ONLY if itinerary has no existing days (to avoid deleting existing days/activities)
              if (!hadDates) {
                try {
                  // Check if itinerary already has days
                  const existingDays = await api.get<ItineraryDayResponseDto[]>(
                    `/itineraries/${itinerary.id}/days`
                  )

                  // Update itinerary dates to match trip dates first
                  await api.patch(`/trips/${trip.id}/itineraries/${itinerary.id}`, {
                    startDate: newStartDate,
                    endDate: newEndDate,
                  })
                  // Invalidate itinerary cache after date update
                  queryClient.invalidateQueries({
                    queryKey: itineraryKeys.list(trip.id),
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryKeys.detail(trip.id, itinerary.id),
                  })

                  // Only auto-generate if no existing days (auto-generate deletes all days first)
                  if (existingDays.length === 0) {
                    await api.post(`/itineraries/${itinerary.id}/days/auto-generate`, {})
                    queryClient.invalidateQueries({
                      queryKey: itineraryDayKeys.list(itinerary.id),
                    })
                    queryClient.invalidateQueries({
                      queryKey: itineraryDayKeys.withActivities(itinerary.id),
                    })
                  }
                } catch {
                  console.warn(`Failed to auto-generate days for itinerary ${itinerary.id}`)
                }
                continue
              }

              // Case 2: Trip dates changed → sync itinerary dates and add days if needed
              // Use UTC parsing to avoid timezone issues
              const newTripStart = new Date(`${newStartDate}T00:00:00Z`)
              const newTripEnd = new Date(`${newEndDate}T00:00:00Z`)
              const itinStart = itinerary.startDate ? new Date(`${itinerary.startDate.split('T')[0]}T00:00:00Z`) : null
              const itinEnd = itinerary.endDate ? new Date(`${itinerary.endDate.split('T')[0]}T00:00:00Z`) : null

              console.log('[DEBUG] Trip date sync:', {
                newTripStart: newStartDate,
                newTripEnd: newEndDate,
                itinStart: itinerary.startDate,
                itinEnd: itinerary.endDate,
                itineraryId: itinerary.id,
              })

              // Calculate if trip dates extend beyond itinerary dates
              // If itinerary dates are null, treat as needing full sync
              const startExtended = itinStart ? newTripStart < itinStart : true
              const endExtended = itinEnd ? newTripEnd > itinEnd : true

              // Fetch existing days to find actual date coverage
              const existingDays = await api.get<ItineraryDayResponseDto[]>(
                `/itineraries/${itinerary.id}/days`
              )

              // Find first and last dated days
              const datedDays = existingDays.filter((d): d is ItineraryDayResponseDto & { date: string } => !!d.date)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              const firstDay = datedDays[0]
              const lastDay = datedDays[datedDays.length - 1]
              const firstDayDate = firstDay ? new Date(`${firstDay.date.split('T')[0]}T00:00:00Z`) : null
              const lastDayDate = lastDay ? new Date(`${lastDay.date.split('T')[0]}T00:00:00Z`) : null

              console.log('[DEBUG] Existing days coverage:', {
                totalDays: existingDays.length,
                datedDays: datedDays.length,
                firstDayDate: firstDayDate?.toISOString(),
                lastDayDate: lastDayDate?.toISOString(),
              })

              // Calculate days to add based on actual day coverage (not itinerary dates)
              let daysToAddAtStart = 0
              let daysToAddAtEnd = 0

              // Use existing day dates to calculate gaps, fall back to itinerary dates
              const effectiveStart = firstDayDate || itinStart
              const effectiveEnd = lastDayDate || itinEnd

              if (startExtended && effectiveStart) {
                daysToAddAtStart = Math.round((effectiveStart.getTime() - newTripStart.getTime()) / (1000 * 60 * 60 * 24))
              }

              if (endExtended && effectiveEnd) {
                daysToAddAtEnd = Math.round((newTripEnd.getTime() - effectiveEnd.getTime()) / (1000 * 60 * 60 * 24))
              }

              console.log('[DEBUG] Extension calc:', {
                startExtended,
                endExtended,
                daysToAddAtStart,
                daysToAddAtEnd,
                itinStartNull: !itinStart,
                itinEndNull: !itinEnd,
              })

              // Always sync itinerary dates to match trip dates when extended or missing
              if (startExtended || endExtended) {
                try {
                  const newItinStart = startExtended ? newStartDate : itinerary.startDate
                  const newItinEnd = endExtended ? newEndDate : itinerary.endDate
                  await api.patch(`/trips/${trip.id}/itineraries/${itinerary.id}`, {
                    startDate: newItinStart,
                    endDate: newItinEnd,
                  })
                  console.log('[DEBUG] Patched itinerary dates:', { newItinStart, newItinEnd })
                  // Invalidate itinerary cache after date update
                  queryClient.invalidateQueries({
                    queryKey: itineraryKeys.list(trip.id),
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryKeys.detail(trip.id, itinerary.id),
                  })
                } catch {
                  console.warn(`Failed to update itinerary ${itinerary.id} dates`)
                }
              }

              // Add days at start if needed
              if (daysToAddAtStart > 0) {
                try {
                  await api.post(`/itineraries/${itinerary.id}/days/batch`, {
                    count: daysToAddAtStart,
                    position: 'start',
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryDayKeys.list(itinerary.id),
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryDayKeys.withActivities(itinerary.id),
                  })
                } catch {
                  console.warn(`Failed to extend itinerary ${itinerary.id} at start`)
                }
              }

              // Add days at end if needed
              if (daysToAddAtEnd > 0) {
                console.log('[DEBUG] Adding days at end:', { count: daysToAddAtEnd, itineraryId: itinerary.id })
                try {
                  await api.post(`/itineraries/${itinerary.id}/days/batch`, {
                    count: daysToAddAtEnd,
                    position: 'end',
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryDayKeys.list(itinerary.id),
                  })
                  queryClient.invalidateQueries({
                    queryKey: itineraryDayKeys.withActivities(itinerary.id),
                  })
                } catch {
                  console.warn(`Failed to extend itinerary ${itinerary.id} at end`)
                }
              }
            }
          } catch {
            console.warn('Failed to fetch trip details for itinerary day extension')
          }
        }

        toast({
          title: 'Trip updated',
          description: 'The trip has been successfully updated.',
        })
        onOpenChange(false)
        form.reset(toTripDefaults())
      }
    } catch (error) {
      // Handle API errors with field-level mapping
      if (error instanceof ApiError) {
        if (error.fieldErrors?.length) {
          mapServerErrors(error.fieldErrors, form.setError, TRIP_FORM_FIELDS)
          setRootError('Please fix the errors above and try again.')
          scrollToFirstError(form.formState.errors)
        } else {
          setRootError(error.message || `Failed to ${mode} trip.`)
        }
      } else {
        setRootError(`Failed to ${mode} trip. Please try again.`)
      }

      toast({
        title: 'Validation Error',
        description: `Failed to ${mode} trip. Please check the form for errors.`,
        variant: 'destructive',
      })
    }
  }

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Trip' : 'Edit Trip'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'create'
              ? 'Fill out the form below to create a new trip.'
              : 'Update the trip details below.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: Trip Name & Trip Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter Trip Name"
                        data-field="name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tripType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-field="tripType">
                          <SelectValue placeholder="Regular Trip" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="leisure">Leisure</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="group">Group</SelectItem>
                        <SelectItem value="corporate">Incentives</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Row 2: Status & Tags */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-field="status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <TagInput
                  value={selectedTagIds}
                  onChange={setSelectedTagIds}
                  onCreateTag={async (name) => {
                    const tag = await createTag.mutateAsync({ name })
                    return tag
                  }}
                  placeholder="Add tag..."
                />
              </FormItem>
            </div>

            {/* Row 3: Travel Dates */}
            <div className="space-y-2">
              <DateRangeInput
                fromValue={form.watch('startDate') || null}
                toValue={form.watch('endDate') || null}
                onChange={(from, to) => {
                  form.setValue('startDate', from || '', { shouldValidate: true })
                  form.setValue('endDate', to || '', { shouldValidate: true })
                }}
                minDuration={1}
                strategy="minimum"
                fromLabel="Travel Start Date"
                toLabel="Travel End Date"
                showDuration
                formatDuration={(days) => `${days} night${days !== 1 ? 's' : ''}`}
                disabled={form.watch('addDatesLater')}
                fromPlaceholder="YYYY-MM-DD"
                toPlaceholder="YYYY-MM-DD"
              />
              {/* Date validation errors */}
              {(form.formState.errors.startDate || form.formState.errors.endDate) && (
                <div className="text-sm text-destructive" data-field="startDate">
                  {form.formState.errors.startDate?.message || form.formState.errors.endDate?.message}
                </div>
              )}
            </div>

            {/* Row 4: Add Dates Later Checkbox */}
            <FormField
              control={form.control}
              name="addDatesLater"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked)
                        // Clear date errors when checking "Add Dates Later"
                        if (checked) {
                          form.clearErrors(['startDate', 'endDate'])
                        }
                      }}
                      data-field="addDatesLater"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Add Dates Later</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {/* Row 5: Cover Photo (create mode only) */}
            {mode === 'create' && (
              <div className="space-y-2">
                <FormLabel>Cover Photo</FormLabel>

                {/* Preview selected photo */}
                {coverPhoto ? (
                  <div className="relative inline-block">
                    <img
                      src={coverPhoto.previewUrl}
                      alt={`Selected cover photo by ${coverPhoto.photographerName}`}
                      className="h-32 w-48 object-cover rounded-lg border border-gray-200"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => setCoverPhoto(null)}
                      aria-label="Remove cover photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Photo by{' '}
                      <a
                        href={`${coverPhoto.photographerUrl}?utm_source=tailfire&utm_medium=referral`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {coverPhoto.photographerName}
                      </a>
                    </p>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowUnsplashPicker(true)}
                    className="w-full justify-start text-muted-foreground"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search for a cover photo...
                  </Button>
                )}

                <FormDescription>
                  Optional: Add a cover photo to make this trip stand out
                </FormDescription>
              </div>
            )}

            {/* Root Error Message */}
            {rootError && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {rootError}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Discard
              </Button>
              <Button
                type="submit"
                disabled={createTrip.isPending || updateTrip.isPending || savingCover || isNavigating}
              >
                {isNavigating
                  ? 'Opening trip...'
                  : savingCover
                    ? 'Saving cover...'
                    : createTrip.isPending || updateTrip.isPending
                      ? 'Saving...'
                      : mode === 'create'
                        ? 'Create Trip'
                        : 'Update Trip'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Unsplash Picker Dialog */}
    <Dialog open={showUnsplashPicker} onOpenChange={setShowUnsplashPicker}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Cover Photo</DialogTitle>
          <DialogDescription>
            Search and select a cover photo from Unsplash
          </DialogDescription>
        </DialogHeader>
        <UnsplashPicker
          onSelect={(photo) => {
            setCoverPhoto({
              id: photo.id,
              previewUrl: photo.urls.regular,
              downloadLocation: photo.links.download_location,
              photographerName: photo.user.name,
              photographerUrl: photo.user.links.html,
            })
            setShowUnsplashPicker(false)
          }}
        />
      </DialogContent>
    </Dialog>
  </>
  )
}
