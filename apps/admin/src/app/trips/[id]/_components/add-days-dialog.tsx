'use client'

import { useState, useMemo } from 'react'
import { CalendarPlus, Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/hooks/use-toast'
import { useBatchCreateItineraryDays } from '@/hooks/use-itinerary-days'
import type { ItineraryDayResponseDto } from '@tailfire/shared-types/api'

interface AddDaysDialogProps {
  itineraryId: string
  existingDays: ItineraryDayResponseDto[]
  tripStartDate?: string | null
  tripEndDate?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * AddDaysDialog Component
 *
 * Simplified dialog for adding days to an itinerary.
 * - Add X days at the end or start of itinerary
 * - Day 0 (Pre-Travel) is preserved when inserting at start
 */
export function AddDaysDialog({
  itineraryId,
  existingDays,
  open,
  onOpenChange,
  onSuccess,
}: AddDaysDialogProps) {
  const { toast } = useToast()
  const batchCreate = useBatchCreateItineraryDays(itineraryId)

  // Form state
  const [count, setCount] = useState(1)
  const [position, setPosition] = useState<'start' | 'end'>('end')

  // Check if Day 0 (Pre-Travel) exists
  const hasDay0 = useMemo(() => {
    return existingDays.some((d) => d.dayNumber === 0)
  }, [existingDays])

  // Find the last day number for preview
  const lastDayNumber = useMemo(() => {
    if (existingDays.length === 0) return 0
    return Math.max(...existingDays.map((d) => d.dayNumber))
  }, [existingDays])

  // Count of regular days (excluding Day 0)
  const regularDayCount = useMemo(() => {
    return existingDays.filter((d) => d.dayNumber !== 0).length
  }, [existingDays])

  // Preview text
  const previewText = useMemo(() => {
    if (count <= 0) return 'Enter number of days to add'

    if (position === 'end') {
      const startDayNum = lastDayNumber + 1
      if (count === 1) {
        return `Will create Day ${startDayNum}`
      }
      return `Will create Days ${startDayNum}-${startDayNum + count - 1}`
    }

    // Position is 'start'
    if (existingDays.length === 0) {
      if (count === 1) return 'Will create Day 1'
      return `Will create Days 1-${count}`
    }

    if (hasDay0) {
      // Adding after Day 0, before Day 1
      if (count === 1) {
        return 'Will insert Day 1 after Pre-Travel (Day 0)'
      }
      return `Will insert Days 1-${count} after Pre-Travel (Day 0)`
    }

    // No Day 0, standard start insert
    if (count === 1) {
      return 'Will insert Day 1, renumbering existing days'
    }
    return `Will insert Days 1-${count}, renumbering existing days`
  }, [count, position, lastDayNumber, existingDays.length, hasDay0])

  // Validation
  const isValid = count >= 1 && count <= 30

  const handleSubmit = async () => {
    try {
      // Backend handles Day 0 correctly: new days are inserted after Day 0
      // with proper sequenceOrder offsets, no collisions
      await batchCreate.mutateAsync({ count, position })

      const actionText = position === 'end' ? 'Created' : 'Inserted'
      toast({
        title: 'Days Added',
        description: previewText.replace('Will create', 'Created').replace('Will insert', actionText),
      })

      // Reset form and close
      setCount(1)
      setPosition('end')
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add days'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setCount(1)
      setPosition('end')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-phoenix-gold-600" />
            Add Days
          </DialogTitle>
          <DialogDescription>
            {existingDays.length === 0
              ? 'Add days to start building your itinerary.'
              : `Add more days to your itinerary (currently ${regularDayCount} day${regularDayCount !== 1 ? 's' : ''}${hasDay0 ? ' + Pre-Travel' : ''}).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Number of Days */}
          <div className="space-y-2">
            <Label htmlFor="day-count">Number of Days</Label>
            <Input
              id="day-count"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
              placeholder="1-30"
            />
          </div>

          {/* Position selector */}
          <div className="space-y-2">
            <Label>Add days to</Label>
            <RadioGroup
              value={position}
              onValueChange={(v) => setPosition(v as 'start' | 'end')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="end" id="position-end" />
                <Label htmlFor="position-end" className="font-normal cursor-pointer">
                  End of itinerary
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="start" id="position-start" />
                <Label htmlFor="position-start" className="font-normal cursor-pointer">
                  Start of itinerary
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Warning when adding at start with Day 0 */}
          {position === 'start' && hasDay0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                New days will be inserted after Pre-Travel (Day 0). Existing days will be renumbered.
              </span>
            </div>
          )}

          {/* Preview */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            {previewText}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || batchCreate.isPending}
            className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600"
          >
            {batchCreate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Days'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
