'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2, Check, X, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import type { ActivityResponseDto } from '@tailfire/shared-types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { useDeleteFlight } from '@/hooks/use-flights'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import type { CruiseColorSet } from '@/lib/cruise-color-utils'
import type { ClientActivityResponseType } from '@tailfire/shared-types/api'

interface ActivitySummaryItemProps {
  itineraryId: string
  activity: ActivityResponseDto
  dayId: string
  cruiseColor?: CruiseColorSet
  clientResponse?: ClientActivityResponseType | null
  commentCount?: number
}

/**
 * Compact activity item for the Trip Summary column.
 * Uses dropdown menu for actions to fit the narrow width.
 */
export function ActivitySummaryItem({ itineraryId, activity, dayId, cruiseColor, clientResponse, commentCount }: ActivitySummaryItemProps) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const { storeReturnContext } = useActivityNavigation()

  const deleteActivity = useDeleteActivity(itineraryId)
  const deleteFlight = useDeleteFlight(itineraryId, dayId)

  const isFlight = activity.componentType === 'flight'

  const handleDelete = async () => {
    try {
      if (isFlight) {
        await deleteFlight.mutateAsync(activity.id)
        toast({
          title: 'Flight deleted',
          description: 'The flight has been removed.',
        })
      } else {
        await deleteActivity.mutateAsync({ activityId: activity.id, dayId })
        toast({
          title: 'Activity deleted',
          description: 'The activity has been removed.',
        })
      }
      setShowDeleteDialog(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to delete ${isFlight ? 'flight' : 'activity'}. Please try again.`,
        variant: 'destructive',
      })
    }
  }

  const handleEdit = () => {
    // Store return context for navigation back after form submission
    storeReturnContext({
      tripId: params.id,
      itineraryId: itineraryId,
      dayId: dayId,
      viewMode: 'board',
    })
    router.push(`/trips/${params.id}/activities/${activity.id}/edit`)
  }

  return (
    <>
      <div
        onDoubleClick={handleEdit}
        className={cn(
          "group flex items-center gap-2 p-2 border border-ash-200 rounded-lg transition-all",
          "hover:border-ash-300 hover:bg-ash-50",
          FOCUS_VISIBLE_RING,
          cruiseColor && `border-l-4 ${cruiseColor.borderLeft}`
        )}
      >
        {/* Icon */}
        <ActivityIconBadge type={activity.activityType} size="sm" />

        {/* Name & Status - truncated */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <p
            className="text-xs font-medium text-ash-900 truncate"
            title={activity.name}
          >
            {activity.name}
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {activity.proposalStatus}
            </Badge>
            {clientResponse === 'confirmed' && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-emerald-100 text-emerald-800">
                <Check className="h-2 w-2" />
              </span>
            )}
            {clientResponse === 'declined' && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-red-100 text-red-800">
                <X className="h-2 w-2" />
              </span>
            )}
            {!!commentCount && commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-blue-100 text-blue-800">
                <MessageSquare className="h-2 w-2" />
                {commentCount}
              </span>
            )}
          </div>
        </div>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0",
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

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {isFlight ? 'Flight' : 'Activity'}</AlertDialogTitle>
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
