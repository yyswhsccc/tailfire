'use client'

import { useState } from 'react'
import { Calendar, Loader2, MoreVertical, Trash2, XCircle } from 'lucide-react'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import { Card } from '@/components/ui/card'
import { formatDate, cn } from '@/lib/utils'
import Link from 'next/link'
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
import { Button } from '@/components/ui/button'
import { useDeleteTrip } from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import { canDeleteTrip } from '@/lib/trip-status-constants'

interface TripCardProps {
  trip: TripResponseDto
  isUpdating?: boolean
}

/**
 * Trip Card
 * Minimal card displaying trip name, cover photo, and dates
 */
export function TripCard({ trip, isUpdating = false }: TripCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const deleteTrip = useDeleteTrip()
  const { toast } = useToast()

  const isDeletable = canDeleteTrip(trip.status)

  const handleDelete = async () => {
    // Guard against stale UI
    if (!canDeleteTrip(trip.status)) return

    try {
      await deleteTrip.mutateAsync(trip.id)
      toast({ title: 'Trip deleted successfully' })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to delete trip'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      <div className="relative group">
        <Link href={`/trips/${trip.id}`}>
          <Card
            className={cn(
              'cursor-pointer relative overflow-hidden p-0',
              isUpdating && 'opacity-70'
            )}
          >
            {/* Cover Photo */}
            {trip.coverPhotoUrl ? (
              <div className="aspect-[3/1] w-full overflow-hidden">
                <img
                  src={trip.coverPhotoUrl}
                  alt={`Cover for ${trip.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            {/* Content */}
            <div className="p-2">
              {isUpdating && (
                <div className="absolute top-2 right-2">
                  <Loader2 className="h-4 w-4 text-phoenix-gold-600 animate-spin" />
                </div>
              )}

              <h3 className="font-semibold text-sm text-ash-900 mb-0.5 pr-6 group-hover:text-phoenix-gold-600 transition-colors">
                {trip.name}
              </h3>

              {trip.referenceNumber && (
                <p className="text-xs text-ash-400 mb-0.5">{trip.referenceNumber}</p>
              )}

              {(trip.startDate || trip.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-ash-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {trip.startDate && formatDate(trip.startDate)}
                    {trip.startDate && trip.endDate && ' - '}
                    {trip.endDate && trip.startDate !== trip.endDate && formatDate(trip.endDate)}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </Link>

        {/* Actions dropdown */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-white/80 hover:bg-white"
                onClick={(e) => e.preventDefault()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDeletable ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault()
                    setShowDeleteDialog(true)
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled
                  className="text-muted-foreground"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel (coming soon)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the trip and all associated data including
              travelers and itineraries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTrip.isPending}
            >
              {deleteTrip.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
