'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MoreVertical, MapPin, Clock, Calendar, CalendarDays, Pencil, Copy, Trash2, Check, X, MessageSquare } from 'lucide-react'
import type { TripResponseDto, ItineraryResponseDto } from '@tailfire/shared-types/api'
import { useItineraryDaysWithActivities } from '@/hooks/use-itinerary-days'
import { useDeleteActivity, useDuplicateActivity, usePatchActivity } from '@/hooks/use-activities'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import {
  ITINERARY_CARD_STYLES,
  DROP_ZONE_BASE,
  DROP_ZONE_ACTIVE,
  FOCUS_VISIBLE_RING,
  SKELETON_BG,
} from '@/lib/itinerary-styles'
import { getActivityTypeMetadata, filterItineraryActivities } from '@/lib/activity-constants'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { parseISODate } from '@/lib/date-utils'
import { formatCurrency } from '@/lib/pricing/currency-helpers'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useSpanningActivities } from '@/hooks/use-spanning-activities'
import { isSpanningActivity, getActivityNights } from '@/lib/spanning-activity-utils'
import { buildCruiseColorMap, getCruiseColor } from '@/lib/cruise-color-utils'
import type { ClientActivityResponseType } from '@tailfire/shared-types/api'

interface ItineraryTableViewProps {
  trip: TripResponseDto
  itinerary: ItineraryResponseDto
  responseMap?: Record<string, ClientActivityResponseType>
  commentCounts?: Record<string, number>
}

// Status badge variants
const statusVariants: Record<string, 'inbound' | 'planning' | 'secondary' | 'default'> = {
  confirmed: 'inbound',
  pending: 'planning',
  cancelled: 'secondary',
  draft: 'default',
}

/**
 * Format time from ISO datetime string
 */
function formatTime(datetime: string | null): string {
  if (!datetime) return '-'
  try {
    const date = new Date(datetime)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '-'
  }
}

/**
 * Format date from ISO datetime string (use parseISODate for TZ-safe parsing)
 */
function formatDate(datetime: string | null): string {
  if (!datetime) return ''
  try {
    const date = parseISODate(datetime)
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Itinerary Table View Component
 *
 * Displays all activities across all days in a flat table format.
 * Columns: Day | Type | Details | Time | Location | Status | Cost | Actions
 */
export function ItineraryTableView({ trip, itinerary, responseMap, commentCounts }: ItineraryTableViewProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { storeReturnContext } = useActivityNavigation()
  const { data: daysWithActivities, isLoading } = useItineraryDaysWithActivities(itinerary.id)

  // State for delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
    dayId: string
  } | null>(null)

  // Make table a drop target for sidebar components
  const { setNodeRef, isOver } = useDroppable({
    id: 'table-drop',
    data: { type: 'table' },
  })

  // Navigate to activity edit page
  const handleRowClick = (activityId: string, dayId: string) => {
    storeReturnContext({
      tripId: trip.id,
      itineraryId: itinerary.id,
      dayId: dayId,
      viewMode: 'table',
    })
    router.push(`/trips/${trip.id}/activities/${activityId}/edit`)
  }

  // Edit action - navigate to edit page
  const handleEdit = (activityId: string, dayId: string) => {
    storeReturnContext({
      tripId: trip.id,
      itineraryId: itinerary.id,
      dayId: dayId,
      viewMode: 'table',
    })
    router.push(`/trips/${trip.id}/activities/${activityId}/edit`)
  }

  // Delete hook - dayId passed at mutation time
  const deleteActivity = useDeleteActivity(itinerary.id)
  const updateActivity = usePatchActivity(itinerary.id)

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !deleteTarget.dayId) return
    try {
      await deleteActivity.mutateAsync({ activityId: deleteTarget.id, dayId: deleteTarget.dayId })
      toast({
        title: 'Activity deleted',
        description: `"${deleteTarget.name}" has been removed.`,
      })
      setDeleteTarget(null)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete activity. Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Duplicate mutation hook - pass dayId directly to mutation
  const duplicateActivity = useDuplicateActivity(itinerary.id)

  // Duplicate action handler
  const handleDuplicate = async (activityId: string, dayId: string, activityName: string) => {
    if (!dayId) {
      toast({
        title: 'Error',
        description: 'Cannot duplicate: missing day information.',
        variant: 'destructive',
      })
      return
    }
    try {
      await duplicateActivity.mutateAsync({ activityId, dayId })
      toast({
        title: 'Activity duplicated',
        description: `"${activityName}" has been copied.`,
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to duplicate activity. Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Process spanning activities
  const { spanningActivities } = useSpanningActivities(daysWithActivities || [])

  // Build cruise color map from full activity list
  const cruiseColorMap = useMemo(() => {
    if (!daysWithActivities) return new Map<string, never>()
    const allActivities = daysWithActivities.flatMap((d) => d.activities)
    return buildCruiseColorMap(allActivities)
  }, [daysWithActivities])

  // Build a map of activity IDs to their spanning info
  const spanningActivityMap = useMemo(() => {
    const map = new Map<string, {
      spannedDayIds: string[]
      totalNights: number | null
    }>()
    for (const spanning of spanningActivities) {
      map.set(spanning.id, {
        spannedDayIds: spanning.spannedDayIds,
        totalNights: getActivityNights(spanning),
      })
    }
    return map
  }, [spanningActivities])

  // Flatten activities with day info for table rows (filter out packages - they belong in Bookings tab)
  const tableRows = useMemo(() => {
    if (!daysWithActivities) return []

    return daysWithActivities.flatMap((day) => {
      // Group parent activities with their children.
      // Children whose parent is on an earlier day appear before later parents.
      const filtered = filterItineraryActivities(day.activities)

      // Identify which parent activities are present in this day
      const parentsInDay = new Set(
        filtered
          .filter((a) => !a.parentActivityId)
          .map((a) => a.id)
      )

      // Collect children grouped by parentActivityId
      const childrenByParent = new Map<string, typeof filtered>()
      for (const a of filtered) {
        if (a.parentActivityId) {
          const list = childrenByParent.get(a.parentActivityId) || []
          list.push(a)
          childrenByParent.set(a.parentActivityId, list)
        }
      }

      // Build sorted list: parent → its children, with orphaned children placed before next parent
      const sorted: typeof filtered = []
      const placed = new Set<string>()

      for (const a of filtered) {
        if (placed.has(a.id)) continue

        const isParent = !a.parentActivityId

        if (isParent) {
          // Before placing this parent, flush any children from earlier parents
          // whose parent is not in this day (continuing from previous days)
          for (const a2 of filtered) {
            if (placed.has(a2.id)) continue
            if (a2.parentActivityId && !parentsInDay.has(a2.parentActivityId)) {
              sorted.push(a2)
              placed.add(a2.id)
            }
          }

          sorted.push(a)
          placed.add(a.id)
          // Pull in all children for this parent
          const children = childrenByParent.get(a.id) || []
          for (const child of children) {
            if (!placed.has(child.id)) {
              sorted.push(child)
              placed.add(child.id)
            }
          }
        } else if (a.parentActivityId && parentsInDay.has(a.parentActivityId)) {
          // Skip — will be placed after its parent
          continue
        } else if (a.parentActivityId && !parentsInDay.has(a.parentActivityId)) {
          // Child whose parent is on a different day — placed before next parent above
          continue
        } else {
          sorted.push(a)
          placed.add(a.id)
        }
      }

      // Any remaining unplaced activities (orphans, edge cases)
      for (const a of filtered) {
        if (!placed.has(a.id)) {
          sorted.push(a)
        }
      }

      return sorted.map((activity) => {
        const spanningInfo = spanningActivityMap.get(activity.id)
        const isActivitySpanning = isSpanningActivity(activity)

        // Determine the position within the span (first, middle, last)
        let spanPosition: 'first' | 'middle' | 'last' | null = null
        if (isActivitySpanning && spanningInfo) {
          const dayIndex = spanningInfo.spannedDayIds.indexOf(day.id)
          if (dayIndex === 0) {
            spanPosition = 'first'
          } else if (dayIndex === spanningInfo.spannedDayIds.length - 1) {
            spanPosition = 'last'
          } else if (dayIndex > 0) {
            spanPosition = 'middle'
          }
        }

        return {
          dayId: day.id,
          dayNumber: day.dayNumber,
          dayDate: day.date,
          dayTitle: day.title,
          activity,
          isSpanning: isActivitySpanning,
          spanPosition,
          spanningInfo,
        }
      })
    })
  }, [daysWithActivities, spanningActivityMap])

  if (isLoading) {
    return (
      <div className={cn(ITINERARY_CARD_STYLES, 'overflow-hidden')} role="status" aria-label="Loading activities">
        <Table>
          <TableHeader>
            <TableRow className="bg-ash-50">
              <TableHead className="w-20 text-xs font-medium uppercase tracking-wide text-ash-600">Day</TableHead>
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600">Type</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-ash-600">Details</TableHead>
              <TableHead className="w-32 text-xs font-medium uppercase tracking-wide text-ash-600">Time</TableHead>
              <TableHead className="w-40 text-xs font-medium uppercase tracking-wide text-ash-600">Location</TableHead>
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600">Status</TableHead>
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600 text-right">Cost</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className={cn('h-4 w-8', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-6 w-16', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-4 w-48', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-4 w-20', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-4 w-32', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-5 w-16', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-4 w-12', SKELETON_BG)} /></TableCell>
                <TableCell><Skeleton className={cn('h-6 w-6', SKELETON_BG)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (tableRows.length === 0) {
    return (
      <div
        ref={setNodeRef}
        aria-label="Activity table drop zone"
        className={cn(
          DROP_ZONE_BASE,
          isOver && DROP_ZONE_ACTIVE
        )}
      >
        <div className={cn(ITINERARY_CARD_STYLES, 'p-8 text-center')}>
          <Calendar className="h-12 w-12 text-ash-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-ash-900 mb-2">No activities yet</h3>
          <p className="text-sm text-ash-500">
            Drag components from the sidebar to add activities to your itinerary.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      aria-label="Activity table drop zone"
      className={cn(
        DROP_ZONE_BASE,
        isOver && DROP_ZONE_ACTIVE
      )}
    >
      <div className={cn(ITINERARY_CARD_STYLES, 'overflow-hidden')}>
      <Table>
        <TableHeader>
          <TableRow className="bg-ash-50">
            <TableHead className="w-20 text-xs font-medium uppercase tracking-wide text-ash-600">Day</TableHead>
            <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600">Type</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-ash-600">Details</TableHead>
            <TableHead className="w-32 text-xs font-medium uppercase tracking-wide text-ash-600">Time</TableHead>
            <TableHead className="w-40 text-xs font-medium uppercase tracking-wide text-ash-600">Location</TableHead>
            <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600">Status</TableHead>
            {trip.calendarDisplayMode === 'activities' && (
              <TableHead className="w-10 text-xs font-medium uppercase tracking-wide text-ash-600 text-center">
                <CalendarDays className="h-3.5 w-3.5 mx-auto text-ash-500" />
              </TableHead>
            )}
            <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-ash-600 text-right">Cost</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row, index) => {
            const metadata = getActivityTypeMetadata(row.activity.activityType)
            const statusVariant = statusVariants[row.activity.status] || 'default'
            const cruiseColor = getCruiseColor(row.activity, cruiseColorMap)

            // Show day info only for first activity of each day
            const showDayInfo =
              index === 0 || tableRows[index - 1]?.dayId !== row.dayId

            return (
              <TableRow
                key={`${row.dayId}-${row.activity.id}`}
                tabIndex={0}
                aria-label={`${row.activity.name} on Day ${row.dayNumber}${row.isSpanning ? ` (spans ${row.spanningInfo?.totalNights || 'multiple'} nights)` : ''}`}
                className={cn(
                  'hover:bg-ash-50 cursor-pointer transition-colors',
                  FOCUS_VISIBLE_RING,
                  showDayInfo && index > 0 && 'border-t-2 border-ash-200',
                  cruiseColor ? cruiseColor.bg : row.isSpanning && 'bg-phoenix-gold-25/50'
                )}
                onClick={() => handleRowClick(row.activity.id, row.dayId)}
                onKeyDown={(e) => e.key === 'Enter' && handleRowClick(row.activity.id, row.dayId)}
              >
                {/* Day Column with Spanning/Cruise Indicator */}
                <TableCell className="py-2 relative">
                  {/* Cruise color continuous bar — full height for all cruise-related rows */}
                  {cruiseColor && (
                    <div
                      className={cn('absolute left-0 top-0 bottom-0 w-1', cruiseColor.bar)}
                      aria-hidden="true"
                    />
                  )}
                  {/* Spanning activity connector line (non-cruise spanning only) */}
                  {!cruiseColor && row.isSpanning && row.spanPosition && (
                    <div
                      className={cn(
                        'absolute left-0 w-1 bg-phoenix-gold-400',
                        row.spanPosition === 'first' && 'top-1/2 bottom-0 rounded-t',
                        row.spanPosition === 'middle' && 'top-0 bottom-0',
                        row.spanPosition === 'last' && 'top-0 bottom-1/2 rounded-b'
                      )}
                      aria-hidden="true"
                    />
                  )}
                  {showDayInfo ? (
                    <div className="flex flex-col pl-2">
                      <span className="font-medium text-xs text-ash-900">Day {row.dayNumber}</span>
                      {row.dayDate && (
                        <span className="text-xs text-ash-500">
                          {formatDate(row.dayDate)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="pl-2" />
                  )}
                </TableCell>

                {/* Type Column */}
                <TableCell className="py-2">
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-ash-900">
                    <ActivityIconBadge type={row.activity.activityType} size="xs" />
                    <span className="capitalize">{metadata.label}</span>
                  </div>
                </TableCell>

                {/* Details Column */}
                <TableCell className="py-2">
                  <div className="flex items-center gap-2">
                    {/* Thumbnail or Icon */}
                    {row.activity.thumbnail ? (
                      <div className="relative w-8 h-8 rounded-md overflow-hidden flex-shrink-0">
                        <Image
                          src={row.activity.thumbnail}
                          alt={row.activity.name}
                          fill
                          className="object-cover"
                          sizes="32px"
                        />
                      </div>
                    ) : (
                      <ActivityIconBadge type={row.activity.activityType} size="sm" />
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-sm text-ash-900 truncate max-w-[250px]" title={row.activity.name}>
                        {row.activity.name}
                      </span>
                      {row.activity.confirmationNumber && (
                        <span className="text-xs text-ash-500">
                          Conf: {row.activity.confirmationNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Time Column */}
                <TableCell className="py-2">
                  <div className="flex flex-col gap-0.5">
                    {row.activity.startDatetime ? (
                      <div className="flex items-center gap-1 text-xs text-ash-700">
                        <Clock className="h-3 w-3 text-ash-400" />
                        <span>
                          {formatTime(row.activity.startDatetime)}
                          {row.activity.endDatetime && !row.isSpanning && (
                            <> - {formatTime(row.activity.endDatetime)}</>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ash-400">-</span>
                    )}
                    {/* Show duration badge for spanning activities */}
                    {row.isSpanning && row.spanPosition === 'first' && row.spanningInfo?.totalNights && (
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium w-fit", cruiseColor ? cruiseColor.badge : 'bg-phoenix-gold-100 text-phoenix-gold-800')}>
                        {row.spanningInfo.totalNights} Night{row.spanningInfo.totalNights > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Location Column */}
                <TableCell className="py-2">
                  {row.activity.location ? (
                    <div className="flex items-center gap-1 text-xs text-ash-700">
                      <MapPin className="h-3 w-3 text-ash-400 flex-shrink-0" />
                      <span className="truncate max-w-[120px]" title={row.activity.location}>
                        {row.activity.location}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-ash-400">-</span>
                  )}
                </TableCell>

                {/* Status Column */}
                <TableCell className="py-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant={statusVariant}>
                      <span className="capitalize text-xs">
                        {row.activity.proposalStatus}
                      </span>
                    </Badge>
                    {responseMap?.[row.activity.id] === 'confirmed' && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-800">
                        <Check className="h-2.5 w-2.5" />
                        Client
                      </span>
                    )}
                    {responseMap?.[row.activity.id] === 'declined' && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-800">
                        <X className="h-2.5 w-2.5" />
                        Client
                      </span>
                    )}
                    {(commentCounts?.[row.activity.id] ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-800">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {commentCounts?.[row.activity.id]}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Calendar Visibility Column */}
                {trip.calendarDisplayMode === 'activities' && (
                  <TableCell className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-6 w-6 p-0",
                              row.activity.isVisibleInCalendar
                                ? "text-indigo-500 hover:text-indigo-700"
                                : "text-ash-300 hover:text-ash-500"
                            )}
                            onClick={() => {
                              updateActivity.mutate({
                                activityId: row.activity.id,
                                dayId: row.dayId,
                                data: { isVisibleInCalendar: !row.activity.isVisibleInCalendar },
                              })
                            }}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{row.activity.isVisibleInCalendar ? 'Hide from calendar' : 'Show on calendar'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                )}

                {/* Cost Column */}
                <TableCell className="py-2 text-right">
                  <span className="text-xs font-medium text-ash-900">
                    {row.activity.pricing?.totalPriceCents != null
                      ? formatCurrency(row.activity.pricing.totalPriceCents, row.activity.pricing.currency || row.activity.currency)
                      : '-'}
                  </span>
                </TableCell>

                {/* Actions Column */}
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn('h-8 w-8 p-0 hover:bg-ash-100', FOCUS_VISIBLE_RING)}
                        aria-label={`Actions for ${row.activity.name}`}
                      >
                        <MoreVertical className="h-4 w-4 text-ash-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(row.activity.id, row.dayId)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDuplicate(row.activity.id, row.dayId, row.activity.name)}
                        disabled={duplicateActivity.isPending}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {duplicateActivity.isPending ? 'Duplicating...' : 'Duplicate'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() =>
                          setDeleteTarget({
                            id: row.activity.id,
                            name: row.activity.name,
                            dayId: row.dayId,
                          })
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

        {/* Summary Footer */}
        <div className="border-t border-ash-200 bg-ash-50 px-4 py-2 flex items-center justify-between text-xs">
          <span className="text-ash-500">
            {tableRows.length} activities across {daysWithActivities?.length || 0} days
          </span>
          <span className="font-medium text-ash-900">
            Total:{' '}
            {formatCurrency(
              tableRows.reduce((sum, row) => {
                const costCents = row.activity.pricing?.totalPriceCents ?? 0
                return sum + costCents
              }, 0)
            )}
          </span>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteActivity.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteActivity.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteActivity.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
