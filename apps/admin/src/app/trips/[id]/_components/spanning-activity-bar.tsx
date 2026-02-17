'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import type { ActivityWithSpan } from '@/lib/spanning-activity-utils'
import { getActivityNights } from '@/lib/spanning-activity-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { useToast } from '@/hooks/use-toast'
import { useDeleteActivity } from '@/hooks/use-activities'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import type { CruiseColorSet } from '@/lib/cruise-color-utils'

interface SpanningActivityBarProps {
  activity: ActivityWithSpan
  itineraryId: string
  /** CSS Grid column start (1-based for CSS Grid) */
  gridColumnStart: number
  /** Number of columns to span */
  gridColumnSpan: number
  /** Optional cruise color override (replaces default teal) */
  cruiseColor?: CruiseColorSet
}

/**
 * Gantt-style bar for activities that span multiple days
 *
 * Renders as a horizontal bar across day columns with:
 * - Sticky image/name visible when scrolling horizontally
 * - Activity thumbnail or icon
 * - Name, duration badge, and status
 * - Click to edit, dropdown menu for actions
 *
 * Uses CSS Grid positioning with gridColumn to span multiple day columns.
 */
export function SpanningActivityBar({
  activity,
  itineraryId,
  gridColumnStart,
  gridColumnSpan,
  cruiseColor,
}: SpanningActivityBarProps) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const { storeReturnContext } = useActivityNavigation()

  const deleteActivity = useDeleteActivity(itineraryId)
  const nights = getActivityNights(activity)

  const handleDelete = async () => {
    try {
      // For spanning activities, use the first spanned day ID
      const dayId = activity.spannedDayIds[0]
      if (!dayId) {
        throw new Error('No day ID found for spanning activity')
      }

      await deleteActivity.mutateAsync({ activityId: activity.id, dayId })
      toast({
        title: 'Activity deleted',
        description: 'The activity has been removed.',
      })
      setShowDeleteDialog(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete activity. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = () => {
    // Store return context for navigation back after form submission
    storeReturnContext({
      tripId: params.id,
      itineraryId: itineraryId,
      dayId: activity.spannedDayIds[0],
      viewMode: 'board',
    })
    router.push(`/trips/${params.id}/activities/${activity.id}/edit`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') handleEdit()
  }

  // Duration label (e.g., "7 Nights")
  const durationLabel = nights !== null && nights > 0
    ? `${nights} Night${nights > 1 ? 's' : ''}`
    : null

  return (
    <>
      <div
        style={{
          gridColumn: `${gridColumnStart} / span ${gridColumnSpan}`,
        }}
        onDoubleClick={handleEdit}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Spanning activity: ${activity.name}${durationLabel ? `, ${durationLabel}` : ''}`}
        className={cn(
          'group relative flex items-center gap-2 px-3 py-2',
          'bg-gradient-to-r border rounded-lg',
          cruiseColor
            ? `${cruiseColor.bgGradient} ${cruiseColor.border} ${cruiseColor.borderHover}`
            : 'from-phoenix-gold-50 to-phoenix-gold-25 border-phoenix-gold-200 hover:border-phoenix-gold-300',
          'hover:shadow-sm transition-all',
          FOCUS_VISIBLE_RING
        )}
      >
        {/* Sticky container for image, name, badges, and actions - visible when scrolling */}
        <div className={cn("sticky left-3 flex items-center gap-2 bg-gradient-to-r pr-6 z-10 rounded-l-md", cruiseColor ? cruiseColor.stickyGradient : 'from-phoenix-gold-50 via-phoenix-gold-50/95 to-phoenix-gold-50/0')}>
          {/* Activity Thumbnail or Icon */}
          {activity.thumbnail ? (
            <div className="relative w-8 h-8 rounded-md overflow-hidden flex-shrink-0 border border-phoenix-gold-200">
              <Image
                src={activity.thumbnail}
                alt={activity.name}
                fill
                className="object-cover"
                sizes="32px"
              />
            </div>
          ) : (
            <ActivityIconBadge type={activity.activityType} size="sm" />
          )}

          {/* Activity Name */}
          <h4
            className="font-medium text-sm text-ash-900 truncate max-w-[180px]"
            title={activity.name}
          >
            {activity.name}
          </h4>

          {/* Duration Badge */}
          {durationLabel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0", cruiseColor ? cruiseColor.badge : 'bg-phoenix-gold-100 text-phoenix-gold-800')}>
                    {durationLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Spans {activity.spanWidth} days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Status Badge */}
          <Badge variant="secondary" className="flex-shrink-0">
            {activity.status}
          </Badge>

          {/* Action Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 w-6 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex-shrink-0 transition-opacity',
                  FOCUS_VISIBLE_RING
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-ash-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Spacer to fill the rest of the bar */}
        <div className="flex-1" />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{activity.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
