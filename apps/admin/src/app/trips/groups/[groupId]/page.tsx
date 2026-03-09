'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Users,
  MapPin,
  Calendar,
  Hash,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  useTripGroups,
  useTripsByGroup,
  useGroupSummary,
  useRemoveTripFromGroup,
  useUpdateGroupStatus,
} from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/pricing/currency-helpers'
import type { TripGroupStatus } from '@tailfire/shared-types/api'

function GroupStatusBadge({ status }: { status: TripGroupStatus | null }) {
  if (!status) return null
  const variantMap: Record<string, 'planning' | 'booked' | 'completed' | 'cancelled' | 'outline'> = {
    planning: 'planning',
    confirmed: 'booked',
    completed: 'completed',
    cancelled: 'cancelled',
  }
  return (
    <Badge variant={variantMap[status] || 'outline'}>
      {status}
    </Badge>
  )
}

function TripStatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'inbound' | 'planning' | 'booked' | 'traveling' | 'completed' | 'cancelled' | 'outline'> = {
    draft: 'inbound',
    quoted: 'planning',
    booked: 'booked',
    in_progress: 'traveling',
    completed: 'completed',
    cancelled: 'cancelled',
    inbound: 'inbound',
  }
  return (
    <Badge variant={variantMap[status] || 'outline'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { toast } = useToast()
  const { data: groups, isLoading: groupsLoading } = useTripGroups()
  const { data: trips } = useTripsByGroup(groupId)
  const { data: summary } = useGroupSummary(groupId)
  const removeTripFromGroup = useRemoveTripFromGroup()
  const updateGroupStatus = useUpdateGroupStatus()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const group = groups?.find((g) => g.id === groupId)

  if (groupsLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading group...</p>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/trips" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
        <p className="text-muted-foreground">Group not found.</p>
      </div>
    )
  }

  const isGroupBooking = group.type === 'group_booking'
  const currency = summary?.currency || 'CAD'

  const handleCancelGroup = async () => {
    try {
      await updateGroupStatus.mutateAsync({
        groupId,
        status: 'cancelled',
        reason: cancelReason,
      })
      toast({
        title: 'Group Cancelled',
        description: 'The group booking and its trips have been cancelled.',
      })
      setShowCancelDialog(false)
      setCancelReason('')
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to cancel the group booking.',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveTrip = async (tripId: string) => {
    try {
      await removeTripFromGroup.mutateAsync({ groupId, tripId })
      toast({
        title: 'Trip Removed',
        description: 'Trip has been removed from this group.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove trip from group.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/trips" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <Badge variant="outline">
              {isGroupBooking ? 'Group Booking' : 'Folder'}
            </Badge>
            {isGroupBooking && <GroupStatusBadge status={group.status} />}
          </div>
          {group.description && (
            <p className="text-muted-foreground mt-1">{group.description}</p>
          )}
        </div>
        {isGroupBooking && group.status !== 'cancelled' && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Cancel Group
          </Button>
        )}
      </div>

      {/* Group Info */}
      {isGroupBooking && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {group.groupNumber && (
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Group Number</p>
                    <p className="font-medium">{group.groupNumber}</p>
                  </div>
                </div>
              )}
              {group.destination && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Destination</p>
                    <p className="font-medium">{group.destination}</p>
                  </div>
                </div>
              )}
              {(group.startDate || group.endDate) && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Travel Dates</p>
                    <p className="font-medium">
                      {group.startDate && new Date(group.startDate).toLocaleDateString()}
                      {group.startDate && group.endDate && ' - '}
                      {group.endDate && new Date(group.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Trips</p>
                  <p className="font-medium">{trips?.length ?? group.tripCount ?? 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Summary */}
      {isGroupBooking && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Package</p>
                <p className="text-xl font-bold">
                  {formatCurrency(summary.totalPackagePriceCents, currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Commission Projected</p>
                <p className="text-xl font-bold">
                  {formatCurrency(summary.totalCommissionProjectedCents, currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Commission Received</p>
                <p className="text-xl font-bold">
                  {formatCurrency(summary.totalCommissionReceivedCents, currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="text-xl font-bold">
                  {formatCurrency(summary.totalBalanceCents, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trips */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Trips ({trips?.length ?? 0})
          </h2>
        </div>
        <div className="space-y-2">
          {trips?.map((trip) => (
            <Card key={trip.id} className="hover:bg-accent/50 transition-colors">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <Link
                  href={`/trips/${trip.id}`}
                  className="flex-1 flex items-center gap-4"
                >
                  <div className="flex-1">
                    <p className="font-medium">{trip.name}</p>
                    {trip.startDate && (
                      <p className="text-sm text-muted-foreground">
                        {new Date(trip.startDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <TripStatusBadge status={trip.status} />
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    handleRemoveTrip(trip.id)
                  }}
                  disabled={removeTripFromGroup.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {(!trips || trips.length === 0) && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No trips in this group yet.
            </p>
          )}
        </div>
      </div>

      {/* Tabs for Notes, Documents, Media */}
      {isGroupBooking && (
        <Tabs defaultValue="notes">
          <TabsList>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
          </TabsList>
          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Notes for this group will be shown here.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Documents for this group will be shown here.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="media" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Media for this group will be shown here.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Cancel Group Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Group Booking</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all {trips?.length || 0} trips in this group.
              Trips that cannot be cancelled will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Cancellation Reason</label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Active</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={updateGroupStatus.isPending}
            >
              {updateGroupStatus.isPending ? 'Cancelling...' : 'Cancel All Trips'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
