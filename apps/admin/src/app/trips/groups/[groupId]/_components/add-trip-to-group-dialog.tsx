'use client'

import { useState, useMemo, useCallback } from 'react'
import { Loader2, Search, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useTrips, useTripGroups, useAddTripsToGroup } from '@/hooks/use-trips'
import { useDebounce } from '@/hooks/use-debounce'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import type { TripResponseDto, TripGroupDto } from '@tailfire/shared-types/api'

interface AddTripToGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  /** Trip IDs already in this group (to exclude from results) */
  existingTripIds: string[]
}

export function AddTripToGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  existingTripIds,
}: AddTripToGroupDialogProps) {
  const { toast } = useToast()

  // Local state
  const [search, setSearch] = useState('')
  const [includeGrouped, setIncludeGrouped] = useState(false)
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set())
  const [showReassignConfirm, setShowReassignConfirm] = useState(false)

  // Debounced search for API calls
  const debouncedSearch = useDebounce(search, 300)

  // Fetch trips with filters
  const { data: tripsResponse, isLoading: isLoadingTrips } = useTrips({
    search: debouncedSearch || undefined,
    ungrouped: includeGrouped ? undefined : true,
    limit: 50,
  })

  // Fetch all trip groups for name lookups
  const { data: tripGroups } = useTripGroups()

  // Mutation
  const addTripsToGroup = useAddTripsToGroup()

  // Build group lookup map: groupId -> group name
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>()
    if (tripGroups) {
      for (const group of tripGroups) {
        map.set(group.id, group.name)
      }
    }
    return map
  }, [tripGroups])

  // Filter out trips that are already in this group
  const filteredTrips = useMemo(() => {
    const allTrips = tripsResponse?.data ?? []
    const existingSet = new Set(existingTripIds)
    return allTrips.filter((trip) => !existingSet.has(trip.id))
  }, [tripsResponse?.data, existingTripIds])

  // Determine which selected trips are in another group (for reassignment warning)
  const tripsInOtherGroups = useMemo(() => {
    return filteredTrips.filter(
      (trip) => selectedTripIds.has(trip.id) && trip.tripGroupId && trip.tripGroupId !== groupId
    )
  }, [filteredTrips, selectedTripIds, groupId])

  // Toggle trip selection
  const toggleTrip = useCallback((tripId: string) => {
    setSelectedTripIds((prev) => {
      const next = new Set(prev)
      if (next.has(tripId)) {
        next.delete(tripId)
      } else {
        next.add(tripId)
      }
      return next
    })
  }, [])

  // Reset all state
  const resetState = useCallback(() => {
    setSearch('')
    setIncludeGrouped(false)
    setSelectedTripIds(new Set())
    setShowReassignConfirm(false)
  }, [])

  // Handle dialog close
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetState()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetState]
  )

  // Handle submit: check for reassignment, then add
  const handleSubmit = useCallback(() => {
    if (selectedTripIds.size === 0) return

    if (tripsInOtherGroups.length > 0) {
      setShowReassignConfirm(true)
    } else {
      performAdd()
    }
  }, [selectedTripIds, tripsInOtherGroups])

  // Actually perform the add mutation
  const performAdd = useCallback(() => {
    const tripIds = Array.from(selectedTripIds)
    addTripsToGroup.mutate(
      { groupId, tripIds },
      {
        onSuccess: () => {
          toast({
            title: 'Trips added',
            description: `${tripIds.length} trip(s) added to ${groupName}.`,
          })
          resetState()
          onOpenChange(false)
        },
        onError: (error) => {
          toast({
            title: 'Failed to add trips',
            description: error instanceof Error ? error.message : 'An unexpected error occurred.',
            variant: 'destructive',
          })
        },
      }
    )
    setShowReassignConfirm(false)
  }, [selectedTripIds, groupId, groupName, addTripsToGroup, toast, resetState, onOpenChange])

  const statusVariant = (status: string) => {
    const map: Record<string, 'inbound' | 'planning' | 'booked' | 'traveling' | 'completed' | 'cancelled' | 'secondary'> = {
      inbound: 'inbound',
      draft: 'secondary',
      quoted: 'planning',
      booked: 'booked',
      in_progress: 'traveling',
      completed: 'completed',
      cancelled: 'cancelled',
    }
    return map[status] ?? 'secondary'
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Trips to Group</DialogTitle>
            <DialogDescription>
              Search for existing trips to add to <strong>{groupName}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search trips by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Include grouped checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-grouped"
              checked={includeGrouped}
              onCheckedChange={(checked) => setIncludeGrouped(checked === true)}
            />
            <label
              htmlFor="include-grouped"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Include trips already in a group
            </label>
          </div>

          {/* Trip list */}
          <div className="max-h-72 overflow-y-auto border rounded-md">
            {isLoadingTrips ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {debouncedSearch ? 'No trips found matching your search.' : 'No ungrouped trips available.'}
              </div>
            ) : (
              <ul className="divide-y">
                {filteredTrips.map((trip) => {
                  const isSelected = selectedTripIds.has(trip.id)
                  const otherGroupName = trip.tripGroupId ? groupNameMap.get(trip.tripGroupId) : null

                  return (
                    <li key={trip.id}>
                      <label
                        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleTrip(trip.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{trip.name}</span>
                            <Badge variant={statusVariant(trip.status)} className="shrink-0">
                              {trip.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {trip.referenceNumber && (
                              <span className="text-xs text-muted-foreground">
                                {trip.referenceNumber}
                              </span>
                            )}
                            {trip.startDate && (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(trip.startDate)}
                                {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                              </span>
                            )}
                          </div>
                          {otherGroupName && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              <Badge variant="outline" className="text-xs">
                                Currently in: {otherGroupName}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedTripIds.size === 0 || addTripsToGroup.isPending}
            >
              {addTripsToGroup.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add {selectedTripIds.size > 0 ? `${selectedTripIds.size} ` : ''}Trip{selectedTripIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassignment confirmation */}
      <AlertDialog open={showReassignConfirm} onOpenChange={setShowReassignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move trips from another group?</AlertDialogTitle>
            <AlertDialogDescription>
              {tripsInOtherGroups.length} trip{tripsInOtherGroups.length !== 1 ? 's' : ''} will be
              moved from {tripsInOtherGroups.length === 1 ? 'its' : 'their'} current group to{' '}
              <strong>{groupName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performAdd}>
              Move and Add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
