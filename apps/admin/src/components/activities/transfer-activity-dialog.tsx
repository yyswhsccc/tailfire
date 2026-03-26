'use client'

import { useState, useMemo } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useItineraries } from '@/hooks/use-itineraries'
import { useItineraryDays } from '@/hooks/use-itinerary-days'
import { useTransferActivity } from '@/hooks/use-activities'

interface TransferActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityId: string
  activityName: string
  tripId: string
  currentItineraryId: string
  currentDayId: string
}

/**
 * Dialog for transferring (moving or copying) an activity to a different
 * itinerary day within the same trip.
 *
 * Flow:
 * 1. Select destination itinerary
 * 2. Select destination day within that itinerary
 * 3. Choose mode: Move (removes from source) or Copy (duplicates)
 * 4. Confirm transfer
 */
export function TransferActivityDialog({
  open,
  onOpenChange,
  activityId,
  activityName,
  tripId,
  currentItineraryId,
  currentDayId,
}: TransferActivityDialogProps) {
  const { toast } = useToast()
  const transferActivity = useTransferActivity()

  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('')
  const [selectedDayId, setSelectedDayId] = useState<string>('')
  const [mode, setMode] = useState<'move' | 'copy'>('move')

  // Pre-select current itinerary when no explicit selection has been made
  const effectiveItineraryId = selectedItineraryId || currentItineraryId

  // Fetch all itineraries for this trip
  const { data: itineraries = [] } = useItineraries(tripId)

  // Fetch days for the effective itinerary (defaults to current itinerary)
  const { data: days = [] } = useItineraryDays(effectiveItineraryId || null)

  // Format day label: "Day 1 - Jun 15" or "Day 1 (untitled)"
  const formatDayLabel = (day: { dayNumber: number; date: string | null; title: string | null }) => {
    const dayLabel = day.dayNumber === 0 ? 'Pre-Travel' : `Day ${day.dayNumber}`
    const dateStr = day.date
      ? ` - ${new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    const titleStr = day.title ? ` (${day.title})` : ''
    return `${dayLabel}${dateStr}${titleStr}`
  }

  // Filter out the current day from the list when on the same itinerary
  const availableDays = useMemo(
    () => effectiveItineraryId === currentItineraryId
      ? days.filter((d) => d.id !== currentDayId)
      : days,
    [days, currentDayId, effectiveItineraryId, currentItineraryId]
  )

  // Reset day selection when itinerary changes
  const handleItineraryChange = (value: string) => {
    setSelectedItineraryId(value)
    setSelectedDayId('')
  }

  const handleTransfer = async () => {
    if (!selectedDayId) return

    try {
      await transferActivity.mutateAsync({
        activityId,
        targetDayId: selectedDayId,
        mode,
      })
      toast({
        title: mode === 'move' ? 'Activity moved' : 'Activity copied',
        description:
          mode === 'move'
            ? `"${activityName}" has been moved to the selected day.`
            : `A copy of "${activityName}" has been created on the selected day.`,
      })
      // Reset and close
      setSelectedItineraryId('')
      setSelectedDayId('')
      setMode('move')
      onOpenChange(false)
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${mode} activity. Please try again.`,
        variant: 'destructive',
      })
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state on close
      setSelectedItineraryId('')
      setSelectedDayId('')
      setMode('move')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfer Activity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Activity name */}
          <div>
            <Label className="text-xs text-muted-foreground">Activity</Label>
            <p className="text-sm font-medium">{activityName}</p>
          </div>

          {/* Mode selector */}
          <div className="space-y-2">
            <Label>Transfer mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as 'move' | 'copy')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="move" id="mode-move" />
                <Label htmlFor="mode-move" className="text-sm font-normal cursor-pointer">
                  Move
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="copy" id="mode-copy" />
                <Label htmlFor="mode-copy" className="text-sm font-normal cursor-pointer">
                  Copy
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {mode === 'move'
                ? 'Removes the activity from its current day and places it on the target day.'
                : 'Creates a duplicate of the activity (with details and pricing) on the target day.'}
            </p>
          </div>

          {/* Itinerary selector */}
          <div className="space-y-2">
            <Label>Destination itinerary</Label>
            <Select
              value={effectiveItineraryId}
              onValueChange={handleItineraryChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an itinerary" />
              </SelectTrigger>
              <SelectContent>
                {itineraries.map((itin) => (
                  <SelectItem key={itin.id} value={itin.id}>
                    {itin.name}
                    {itin.id === currentItineraryId ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day selector */}
          <div className="space-y-2">
            <Label>Destination day</Label>
            <Select
              value={selectedDayId}
              onValueChange={setSelectedDayId}
              disabled={!effectiveItineraryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a day" />
              </SelectTrigger>
              <SelectContent>
                {availableDays.map((day) => (
                  <SelectItem key={day.id} value={day.id}>
                    {formatDayLabel(day)}
                  </SelectItem>
                ))}
                {availableDays.length === 0 && effectiveItineraryId && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No other days available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedDayId || transferActivity.isPending}
          >
            {transferActivity.isPending
              ? mode === 'move'
                ? 'Moving...'
                : 'Copying...'
              : mode === 'move'
                ? 'Move Activity'
                : 'Copy Activity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
