'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { GripVertical, Pencil, Trash2, MoreHorizontal, Package, Check, X, MessageSquare, CalendarDays, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import type { ActivityResponseDto } from '@tailfire/shared-types/api'
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
  DropdownMenuSeparator,
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
import { useDeleteActivity, useUpdateActivity } from '@/hooks/use-activities'
import { useDeleteFlight } from '@/hooks/use-flights'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import type { CruiseColorSet } from '@/lib/cruise-color-utils'
import type { ClientActivityResponseType } from '@tailfire/shared-types/api'
import { TransferActivityDialog } from '@/components/activities/transfer-activity-dialog'

interface ActivityListItemProps {
  itineraryId: string
  activity: ActivityResponseDto
  dayId: string
  dayDate?: string | null
  cruiseColor?: CruiseColorSet
  clientResponse?: ClientActivityResponseType | null
  commentCount?: number
  calendarDisplayMode?: 'trip' | 'activities'
}

export function ActivityListItem({ itineraryId, activity, dayId, dayDate: _dayDate, cruiseColor, clientResponse, commentCount, calendarDisplayMode }: ActivityListItemProps) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const { storeReturnContext } = useActivityNavigation()

  const deleteActivity = useDeleteActivity(itineraryId)
  const deleteFlight = useDeleteFlight(itineraryId, dayId)
  const updateActivity = useUpdateActivity(itineraryId, dayId)

  const isFlight = activity.componentType === 'flight'

  // Sortable hook for drag-and-drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: activity.id,
    data: {
      type: 'activity',
      activity,
      sourceDayId: dayId,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') handleEdit()
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onDoubleClick={handleEdit}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Activity: ${activity.name}`}
        className={cn(
          "group flex items-start gap-1.5 p-2 border border-ash-200 rounded-lg transition-all",
          "hover:border-ash-300 hover:bg-ash-50 hover:shadow-sm hover:-translate-y-px",
          FOCUS_VISIBLE_RING,
          isDragging && "border-phoenix-gold-500 shadow-md scale-[1.02]",
          cruiseColor && `border-l-4 ${cruiseColor.borderLeft}`
        )}
      >
        {/* Drag Handle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                aria-label="Drag to reorder activity"
                className="pt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4 text-ash-400 hover:text-ash-600" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Drag to reorder</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Activity Thumbnail or Icon */}
        {activity.thumbnail ? (
          <div className="relative w-7 h-7 rounded-md overflow-hidden flex-shrink-0">
            <Image
              src={activity.thumbnail}
              alt={activity.name}
              fill
              className="object-cover"
              sizes="28px"
            />
          </div>
        ) : (
          <ActivityIconBadge type={activity.activityType} size="sm" />
        )}

        {/* Activity Details */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5">
                <h4
                  className="font-medium text-sm text-ash-900 truncate"
                  title={activity.name}
                >
                  {activity.name}
                </h4>
                <Badge variant="secondary" className="flex-shrink-0">
                  {activity.proposalStatus}
                </Badge>
                {activity.packageId && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800 flex-shrink-0">
                          <Package className="h-2.5 w-2.5" />
                          PKG
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Linked to a booking/package</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {clientResponse === 'confirmed' && (
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-800 flex-shrink-0">
                    <Check className="h-2.5 w-2.5" />
                    Client
                  </span>
                )}
                {clientResponse === 'declined' && (
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-800 flex-shrink-0">
                    <X className="h-2.5 w-2.5" />
                    Client
                  </span>
                )}
                {!!commentCount && commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                    <MessageSquare className="h-2.5 w-2.5" />
                    {commentCount}
                  </span>
                )}
              </div>
            </div>

            {/* Calendar Visibility Toggle (only in activities mode) */}
            {calendarDisplayMode === 'activities' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-6 w-6 p-0 flex-shrink-0",
                        FOCUS_VISIBLE_RING,
                        activity.isVisibleInCalendar
                          ? "text-indigo-500 hover:text-indigo-700"
                          : "text-ash-300 hover:text-ash-500"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateActivity.mutate({
                          id: activity.id,
                          data: { isVisibleInCalendar: !activity.isVisibleInCalendar },
                        })
                      }}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{activity.isVisibleInCalendar ? 'Hide from calendar' : 'Show on calendar'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Action Buttons - Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex-shrink-0 transition-opacity",
                    FOCUS_VISIBLE_RING
                  )}
                >
                  <MoreHorizontal className="h-3.5 w-3.5 text-ash-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTransferDialog(true)}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                  Transfer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
        </div>
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

      {/* Transfer Activity Dialog */}
      <TransferActivityDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        activityId={activity.id}
        activityName={activity.name}
        tripId={params.id}
        currentItineraryId={itineraryId}
        currentDayId={dayId}
      />
    </>
  )
}
