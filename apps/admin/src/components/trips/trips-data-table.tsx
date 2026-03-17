'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, MoreVertical, RotateCcw, Trash2, Archive, XCircle, User } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TripStatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { formatDate, cn } from '@/lib/utils'
import { canDeleteTrip, type TripStatus } from '@/lib/trip-status-constants'
import { canTransitionTripStatus } from '@tailfire/shared-types/api'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import { useUncancelTrip } from '@/hooks/use-trips'
import { useUser } from '@/hooks/use-user'
import { useToast } from '@/hooks/use-toast'
import { CancelTripDialog } from './cancel-trip-dialog'

interface TripsDataTableProps {
  trips: TripResponseDto[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
}

const TRIP_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  business: 'Business',
  group: 'Group',
  honeymoon: 'Honeymoon',
  corporate: 'Corporate',
  custom: 'Custom',
}

export function TripsDataTable({
  trips,
  selectedIds,
  onSelectionChange,
  onDelete,
  onArchive,
}: TripsDataTableProps) {
  const [cancelTrip, setCancelTrip] = useState<{ id: string; name: string } | null>(null)
  const uncancelTrip = useUncancelTrip()
  const { isAdmin } = useUser()
  const { toast } = useToast()
  const allSelected = trips.length > 0 && selectedIds.size === trips.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < trips.length

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(trips.map((t) => t.id)))
    }
  }

  const handleSelectRow = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    onSelectionChange(newSelection)
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                No trips found
              </TableCell>
            </TableRow>
          ) : (
            trips.map((trip) => (
              <TableRow
                key={trip.id}
                className={cn(selectedIds.has(trip.id) && 'bg-muted/50')}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(trip.id)}
                    onCheckedChange={() => handleSelectRow(trip.id)}
                    aria-label={`Select ${trip.name}`}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="font-medium hover:text-phoenix-gold-600 transition-colors"
                  >
                    {trip.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {trip.owner ? (
                    <span className="text-sm">{trip.owner.name}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Unassigned
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {trip.referenceNumber || '-'}
                </TableCell>
                <TableCell>
                  <TripStatusBadge status={trip.status as TripStatus} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {trip.tripType ? TRIP_TYPE_LABELS[trip.tripType] || trip.tripType : '-'}
                </TableCell>
                <TableCell>
                  {trip.tags && trip.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {trip.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {trip.tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{trip.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {trip.startDate || trip.endDate ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {trip.startDate && formatDate(trip.startDate)}
                        {trip.startDate && trip.endDate && ' - '}
                        {trip.endDate && trip.startDate !== trip.endDate && formatDate(trip.endDate)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onArchive && (
                        <DropdownMenuItem onClick={() => onArchive(trip.id)}>
                          <Archive className="mr-2 h-4 w-4" />
                          {trip.isArchived ? 'Unarchive' : 'Archive'}
                        </DropdownMenuItem>
                      )}
                      {trip.status === 'cancelled' && isAdmin && (
                        <DropdownMenuItem
                          onClick={() => {
                            uncancelTrip.mutateAsync(trip.id).then(() => {
                              toast({ title: 'Trip restored', description: 'Trip has been un-cancelled.' })
                            })
                          }}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Un-cancel Trip
                        </DropdownMenuItem>
                      )}
                      {canDeleteTrip(trip.status as TripStatus) ? (
                        <DropdownMenuItem
                          onClick={() => onDelete?.(trip.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      ) : null}
                      {canTransitionTripStatus(trip.status as any, 'cancelled') && (
                        <DropdownMenuItem
                          onClick={() => setCancelTrip({ id: trip.id, name: trip.name })}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel Trip
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {cancelTrip && (
        <CancelTripDialog
          open={!!cancelTrip}
          onOpenChange={(open) => { if (!open) setCancelTrip(null) }}
          tripId={cancelTrip.id}
          tripName={cancelTrip.name}
        />
      )}
    </div>
  )
}
