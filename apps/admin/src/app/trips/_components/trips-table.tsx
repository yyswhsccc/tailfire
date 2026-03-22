'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
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
import { TripFormDialog } from './trip-form-dialog'
import { formatDate } from '@/lib/utils'
import { formatCurrency, dollarsToCents } from '@/lib/pricing/currency-helpers'

interface TripsTableProps {
  trips: TripResponseDto[]
  onDelete: (id: string) => void
  isDeleting: boolean
}

export function TripsTable({ trips, onDelete, isDeleting }: TripsTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editTrip, setEditTrip] = useState<TripResponseDto | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'inbound':
        return 'bg-gray-50 text-gray-700'
      case 'planning':
        return 'bg-yellow-50 text-yellow-700'
      case 'active':
        return 'bg-blue-50 text-blue-700'
      case 'travelling':
        return 'bg-cyan-50 text-cyan-700'
      case 'travelled':
        return 'bg-green-50 text-green-700'
      case 'cancelled':
        return 'bg-red-50 text-red-700'
      default:
        return 'bg-gray-50 text-gray-700'
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trip Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total Cost</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((trip) => (
            <TableRow key={trip.id}>
              <TableCell className="font-medium">{trip.name}</TableCell>
              <TableCell className="capitalize">{trip.tripType || '-'}</TableCell>
              <TableCell>
                {trip.startDate
                  ? `${formatDate(trip.startDate)}${trip.endDate ? ` - ${formatDate(trip.endDate)}` : ''}`
                  : '-'}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(trip.status)}`}
                >
                  {trip.status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </TableCell>
              <TableCell>
                {trip.estimatedTotalCost
                  ? formatCurrency(dollarsToCents(trip.estimatedTotalCost), trip.currency)
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTrip(trip)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(trip.id)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              trip and all associated data including travelers and itineraries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  onDelete(deleteId)
                  setDeleteId(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <TripFormDialog
        open={!!editTrip}
        onOpenChange={(open) => !open && setEditTrip(null)}
        mode="edit"
        trip={editTrip || undefined}
      />
    </>
  )
}
