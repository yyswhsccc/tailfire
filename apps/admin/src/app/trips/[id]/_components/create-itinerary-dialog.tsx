'use client'

import { useState, useEffect } from 'react'
import { Check, X, Upload, Search, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { useToast } from '@/hooks/use-toast'
import { useCreateItinerary } from '@/hooks/use-itineraries'
import { itineraryDayKeys } from '@/hooks/use-itinerary-days'
import { api } from '@/lib/api'
import { UnsplashPicker } from '@/components/unsplash-picker'

import type { ItineraryResponseDto } from '@tailfire/shared-types/api'

interface CreateItineraryDialogProps {
  tripId: string
  tripStartDate?: string | null
  tripEndDate?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (itinerary: ItineraryResponseDto) => void
}

/**
 * Create Itinerary Modal
 *
 * Matches TERN's pattern with:
 * - Name field
 * - Travel Dates (start/end)
 * - Cover Photo (search/upload)
 * - Overview Statement (rich text placeholder)
 */
export function CreateItineraryDialog({
  tripId,
  tripStartDate,
  tripEndDate,
  open,
  onOpenChange,
  onSuccess,
}: CreateItineraryDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const createItinerary = useCreateItinerary(tripId)

  const [formData, setFormData] = useState({
    name: '',
    startDate: tripStartDate || '',
    endDate: tripEndDate || '',
    coverPhoto: '',
    overview: '',
  })

  // Unsplash picker state
  const [showUnsplashPicker, setShowUnsplashPicker] = useState(false)

  // Pre-travel day option (disabled by default)
  const [includePreTravel, setIncludePreTravel] = useState(false)

  // Reset form when dialog opens with new trip dates
  useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        startDate: tripStartDate || '',
        endDate: tripEndDate || '',
      }))
    }
  }, [open, tripStartDate, tripEndDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    const trimmedName = formData.name.trim()
    if (!trimmedName) {
      toast({
        title: 'Validation Error',
        description: 'Itinerary name is required.',
        variant: 'destructive',
      })
      return
    }

    // Validate dates if provided
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)
      if (end < start) {
        toast({
          title: 'Validation Error',
          description: 'End date must be after start date.',
          variant: 'destructive',
        })
        return
      }
    }

    // Validate itinerary dates are within trip date range
    if (tripStartDate && formData.startDate) {
      const tripStart = new Date(tripStartDate)
      const itinStart = new Date(formData.startDate)
      if (itinStart < tripStart) {
        toast({
          title: 'Validation Error',
          description: `Start date cannot be before trip start date (${tripStartDate}).`,
          variant: 'destructive',
        })
        return
      }
    }

    if (tripEndDate && formData.endDate) {
      const tripEnd = new Date(tripEndDate)
      const itinEnd = new Date(formData.endDate)
      if (itinEnd > tripEnd) {
        toast({
          title: 'Validation Error',
          description: `End date cannot be after trip end date (${tripEndDate}).`,
          variant: 'destructive',
        })
        return
      }
    }

    if (tripStartDate && formData.endDate) {
      const tripStart = new Date(tripStartDate)
      const itinEnd = new Date(formData.endDate)
      if (itinEnd < tripStart) {
        toast({
          title: 'Validation Error',
          description: `End date cannot be before trip start date (${tripStartDate}).`,
          variant: 'destructive',
        })
        return
      }
    }

    if (tripEndDate && formData.startDate) {
      const tripEnd = new Date(tripEndDate)
      const itinStart = new Date(formData.startDate)
      if (itinStart > tripEnd) {
        toast({
          title: 'Validation Error',
          description: `Start date cannot be after trip end date (${tripEndDate}).`,
          variant: 'destructive',
        })
        return
      }
    }

    try {
      const newItinerary = await createItinerary.mutateAsync({
        name: trimmedName,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        coverPhoto: formData.coverPhoto.trim() || undefined,
        overview: formData.overview.trim() || undefined,
      })

      // Auto-generate days if itinerary OR trip has dates
      // The API falls back to trip dates if itinerary dates are not set
      const hasDates =
        (newItinerary.startDate && newItinerary.endDate) ||
        (tripStartDate && tripEndDate)

      if (hasDates) {
        try {
          await api.post(`/itineraries/${newItinerary.id}/days/auto-generate`, {
            includePreTravelDay: includePreTravel,
          })
          // Invalidate day queries so UI fetches the newly generated days
          queryClient.invalidateQueries({
            queryKey: itineraryDayKeys.list(newItinerary.id),
          })
          queryClient.invalidateQueries({
            queryKey: itineraryDayKeys.withActivities(newItinerary.id),
          })
        } catch {
          // Days generation failed but itinerary was created - don't block success
          console.warn('Auto-generate days failed, but itinerary was created')
        }
      }

      toast({
        title: 'Itinerary created',
        description: `"${trimmedName}" has been created successfully.`,
      })

      // Reset form
      setFormData({
        name: '',
        startDate: tripStartDate || '',
        endDate: tripEndDate || '',
        coverPhoto: '',
        overview: '',
      })
      setIncludePreTravel(false)

      onSuccess?.(newItinerary)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create itinerary. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const isSubmitting = createItinerary.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(85vh,calc(100dvh-2rem))] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle>Create Itinerary</DialogTitle>
          <DialogDescription>
            Create a new itinerary option for this trip
          </DialogDescription>
        </DialogHeader>

        <form id="create-itinerary-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 space-y-6">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Name *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Option A - Luxury Experience"
              autoFocus
            />
            <p className="text-xs text-ash-500 mt-1">
              Give this itinerary option a descriptive name
            </p>
          </div>

          {/* Travel Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Start Date
              </label>
              <DatePickerEnhanced
                value={formData.startDate || null}
                onChange={(date) => setFormData({ ...formData, startDate: date || '' })}
                minDate={tripStartDate || undefined}
                maxDate={tripEndDate || undefined}
                placeholder="Select start date"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ash-900 block mb-2">
                End Date
              </label>
              <DatePickerEnhanced
                value={formData.endDate || null}
                onChange={(date) => setFormData({ ...formData, endDate: date || '' })}
                minDate={formData.startDate || tripStartDate || undefined}
                maxDate={tripEndDate || undefined}
                placeholder="Select end date"
              />
            </div>
          </div>
          {tripStartDate && tripEndDate && (
            <p className="text-xs text-ash-500 -mt-3">
              Dates must be within trip dates: {tripStartDate} to {tripEndDate}
            </p>
          )}
          {(!tripStartDate || !tripEndDate) && (
            <p className="text-xs text-ash-500 -mt-3">
              Optional: Set travel dates for this itinerary
            </p>
          )}

          {/* Pre-Travel Day Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includePreTravel"
              checked={includePreTravel}
              onCheckedChange={(checked) => setIncludePreTravel(checked === true)}
            />
            <Label htmlFor="includePreTravel" className="text-sm cursor-pointer">
              Include Pre-Travel Day (Day 0)
            </Label>
          </div>
          <p className="text-xs text-ash-500 -mt-3">
            Adds a Day 0 for pre-trip information like packing lists or flight details
          </p>

          {/* Cover Photo */}
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Cover Photo
            </label>

            {/* Preview selected photo */}
            {formData.coverPhoto ? (
              <div className="mb-3">
                <div className="relative inline-block">
                  <img
                    src={formData.coverPhoto}
                    alt="Cover photo preview"
                    className="h-32 w-48 object-cover rounded-lg border border-ash-200"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => {
                      setFormData({ ...formData, coverPhoto: '' })
                      setShowUnsplashPicker(false)
                    }}
                    title="Remove photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={formData.coverPhoto}
                  onChange={(e) => setFormData({ ...formData, coverPhoto: e.target.value })}
                  placeholder="Photo URL or search for stock images..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Search stock photos"
                onClick={() => setShowUnsplashPicker(true)}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Upload image"
                disabled
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-ash-500 mt-1">
              Optional: Add a cover photo for this itinerary option
            </p>
          </div>

          {/* Overview Statement */}
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Overview Statement
            </label>
            <Textarea
              value={formData.overview}
              onChange={(e) => setFormData({ ...formData, overview: e.target.value })}
              placeholder="Describe this itinerary option for travelers..."
              rows={6}
            />
            <p className="text-xs text-ash-500 mt-1">
              Optional: Write a brief overview of what makes this itinerary special
            </p>
          </div>

          {/* Spacer for bottom padding inside scroll area */}
          <div className="pb-2" />
        </form>

        {/* Actions - Fixed at bottom */}
        <div className="flex-shrink-0 flex gap-2 justify-end p-6 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-itinerary-form"
            disabled={isSubmitting}
            className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
          >
            <Check className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Creating...' : 'Create Itinerary'}
          </Button>
        </div>

        {/* Unsplash Picker Dialog */}
        <Dialog open={showUnsplashPicker} onOpenChange={setShowUnsplashPicker}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Search Stock Photos</DialogTitle>
              <DialogDescription>
                Search and select a cover photo from Unsplash
              </DialogDescription>
            </DialogHeader>
            <UnsplashPicker
              onSelect={(photo) => {
                setFormData({ ...formData, coverPhoto: photo.urls.regular })
                setShowUnsplashPicker(false)
              }}
            />
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
