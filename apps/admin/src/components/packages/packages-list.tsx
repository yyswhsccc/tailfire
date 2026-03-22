'use client'

/**
 * Bookings List Component
 *
 * Displays bookings for a trip using the bookings API.
 * Allows adding new booking items (activities) via the "New Item" dropdown.
 * Allows generating invoices/trip orders for the trip.
 *
 * Includes:
 * - Totals overview card
 * - "Generate Invoice" and "New Item" action buttons (TERN-style)
 * - Bookings data table with status badges
 * - Click through to booking detail page for editing
 * - Quick activity linking and mark-as-booked actions
 */

import React, { useState, useMemo, memo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PackageResponseDto, TripPackageTotalsDto, UnlinkedActivityDto, PackageLinkedActivityDto } from '@tailfire/shared-types'
import {
  useBookings,
  useTripBookingTotals,
  useUnlinkedActivities,
  useDeleteBooking,
  useLinkActivities,
  useBookingLinkedActivities,
  getPackageStatusLabel,
  getPackageStatusVariant,
  getPaymentStatusLabel,
  getPaymentStatusVariant,
} from '@/hooks/use-bookings'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  DropdownMenuLabel,
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
import { ActivityLinkerSheet } from './activity-linker-sheet'
import { MarkAsBookedModal } from './mark-as-booked-modal'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Link2,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Check,
  Info,
  Plus,
  Loader2,
  Boxes,
  Plane,
  Hotel,
  Car,
  MapPin,
  Ship,
} from 'lucide-react'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { TripOrderGeneratorButton } from '@/components/trips/trip-order-generator'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

interface PackagesListProps {
  tripId: string
  currency: string
  itineraryId?: string // Optional - needed for navigating to activity creation
  filterItineraryId?: string | null // Optional - filter bookings by itinerary (null = show all)
}

// Group activities by parent for hierarchical display (e.g., port_info under cruise)
type GroupedActivity = {
  activity: PackageLinkedActivityDto
  children: PackageLinkedActivityDto[]
}

function groupActivitiesByParent(activities: PackageLinkedActivityDto[]): GroupedActivity[] {
  const childrenMap = new Map<string, PackageLinkedActivityDto[]>()

  // First pass: identify children and group them by parent
  for (const activity of activities) {
    if (activity.parentActivityId) {
      const existing = childrenMap.get(activity.parentActivityId) || []
      existing.push(activity)
      childrenMap.set(activity.parentActivityId, existing)
    }
  }

  // Second pass: build grouped list with parents/standalone first
  const result: GroupedActivity[] = []
  for (const activity of activities) {
    if (activity.parentActivityId) {
      // Skip children - they'll be included under their parent
      continue
    }
    const children = childrenMap.get(activity.id) || []
    result.push({ activity, children })
  }

  return result
}

// Memoized component for expanded activity rows
const ExpandedActivitiesRow = memo(function ExpandedActivitiesRow({
  bookingId,
  colSpan,
}: {
  bookingId: string
  colSpan: number
}) {
  const { data: activities, isLoading, error } = useBookingLinkedActivities(bookingId)

  const groupedActivities = useMemo(() => {
    if (!activities) return []
    return groupActivitiesByParent(activities)
  }, [activities])

  if (isLoading) {
    return (
      <TableRow className="bg-gray-50 border-b">
        <TableCell colSpan={colSpan} className="py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 pl-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading linked activities...
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (error) {
    return (
      <TableRow className="bg-gray-50 border-b">
        <TableCell colSpan={colSpan} className="py-4">
          <div className="flex items-center gap-2 text-sm text-red-500 pl-8">
            <AlertCircle className="h-4 w-4" />
            Failed to load activities
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <TableRow className="bg-gray-50 border-b">
        <TableCell colSpan={colSpan} className="py-4">
          <div className="text-sm text-gray-500 pl-8">No activities linked to this booking</div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className="bg-gray-50 border-b">
      <TableCell colSpan={colSpan} className="py-2 px-4">
        <div className="pl-4 space-y-0.5">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Linked Activities ({activities.length})
          </div>
          {groupedActivities.map(({ activity, children }) => (
            <div key={activity.id}>
              {/* Parent or standalone activity */}
              <div className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-gray-100">
                <ActivityIconBadge type={activity.activityType} size="xs" />
                <span className="font-medium text-xs">{activity.name}</span>
                <span className="text-[10px] text-gray-500 capitalize">
                  {activity.activityType.replace('_', ' ')}
                </span>
                {activity.dayNumber && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
                    Day {activity.dayNumber}
                  </Badge>
                )}
              </div>
              {/* Child activities (e.g., port_info under cruise) */}
              {children.length > 0 && (
                <div className="ml-6 border-l-2 border-gray-200 pl-2 space-y-0.5">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-gray-100"
                    >
                      <ActivityIconBadge type={child.activityType} size="xs" />
                      <span className="text-xs text-gray-700">{child.name}</span>
                      <span className="text-[10px] text-gray-400 capitalize">
                        {child.activityType.replace('_', ' ')}
                      </span>
                      {child.dayNumber && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
                          Day {child.dayNumber}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  )
})

export function PackagesList({ tripId, currency, itineraryId, filterItineraryId }: PackagesListProps) {
  const router = useRouter()
  const [isLinkerOpen, setIsLinkerOpen] = useState(false)
  const [isMarkAsBookedOpen, setIsMarkAsBookedOpen] = useState(false)
  const [linkingBookingId, setLinkingBookingId] = useState<string | null>(null)
  const [markAsBookedTarget, setMarkAsBookedTarget] = useState<{
    id: string
    name: string
    status: string
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set())

  // Toggle expand/collapse for a booking row
  const toggleExpand = useCallback((bookingId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedBookings((prev) => {
      const next = new Set(prev)
      if (next.has(bookingId)) {
        next.delete(bookingId)
      } else {
        next.add(bookingId)
      }
      return next
    })
  }, [])

  const { data: bookingsData, isLoading: bookingsLoading, error: bookingsError } = useBookings({ tripId })
  const { data: totals, isLoading: totalsLoading } = useTripBookingTotals(tripId)
  const { data: unlinkedData, isLoading: unlinkedLoading } = useUnlinkedActivities(tripId)
  const deleteBooking = useDeleteBooking()
  const linkActivities = useLinkActivities()
  const { toast } = useToast()

  // Navigate to create a new activity/booking item
  // Uses pendingDay mode so user can select the day for the activity
  // Package type navigates to dedicated package form
  const handleNewItem = (activityType: string) => {
    if (activityType === 'package') {
      // Package = booking without activities, goes to unified activities route
      router.push(`/trips/${tripId}/activities/new?type=package`)
      return
    }

    const params = new URLSearchParams({
      type: activityType,
      pendingDay: 'true',
    })
    if (itineraryId) {
      params.set('itineraryId', itineraryId)
    }
    router.push(`/trips/${tripId}/activities/new?${params.toString()}`)
  }

  const handleLinkActivities = (bookingId: string) => {
    setLinkingBookingId(bookingId)
    setIsLinkerOpen(true)
  }

  const handleMarkAsBooked = (booking: { id: string; name: string; proposalStatus: string }) => {
    setMarkAsBookedTarget({
      id: booking.id,
      name: booking.name,
      status: booking.proposalStatus,
    })
    setIsMarkAsBookedOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return

    try {
      await deleteBooking.mutateAsync({ id: deleteConfirm.id, tripId })
      toast({
        title: 'Booking deleted',
        description: `"${deleteConfirm.name}" has been deleted. Linked activities are now unlinked.`,
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete booking. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleteConfirm(null)
    }
  }

  // Handler for linking an unlinked activity to a booking
  const handleLinkUnlinkedActivity = async (activityId: string, bookingId: string) => {
    try {
      await linkActivities.mutateAsync({ bookingId, activityIds: [activityId] })
      toast({
        title: 'Activity linked',
        description: 'The activity has been linked to the package.',
      })
    } catch (error) {
      let errorMessage = 'Failed to link activity. Please try again.'
      if (error instanceof Error) {
        const message = error.message.toLowerCase()
        if (message.includes('different itinerary') || message.includes('same itinerary')) {
          errorMessage = 'Cannot link activities from different itineraries to the same package.'
        } else if (error.message) {
          errorMessage = error.message
        }
      }
      toast({
        title: 'Failed to link activity',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  if (bookingsLoading || totalsLoading || unlinkedLoading) {
    return <BookingsListSkeleton />
  }

  if (bookingsError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Bookings</h3>
        <p className="text-sm text-gray-500">Please try refreshing the page.</p>
      </div>
    )
  }

  // Get bookings and apply itinerary filter
  // Type assertion for runtime fields that may exist but aren't in the type definition
  const allBookings = (bookingsData || []) as Array<
    PackageResponseDto & {
      itineraryIds?: string[]
      activityCount?: number
      paymentStatus?: string
      supplierName?: string | null
      dateBooked?: string | null
    }
  >
  const unlinkedBookingsCount = allBookings.filter(
    (b) => !b.itineraryIds || b.itineraryIds.length === 0
  ).length
  const bookings = filterItineraryId
    ? allBookings.filter((booking) => {
        // If booking has no linked activities (no itineraryIds), include it in 'all' view only
        if (!booking.itineraryIds || booking.itineraryIds.length === 0) {
          return false // Unlinked bookings are filtered out when viewing a specific itinerary
        }
        // Include booking if it has activities in the selected itinerary
        return booking.itineraryIds.includes(filterItineraryId)
      })
    : allBookings // Show all bookings when filterItineraryId is null/undefined

  // Show notice when filtering hides unlinked bookings
  const showUnlinkedNotice = filterItineraryId && unlinkedBookingsCount > 0

  // Get unlinked activities
  const unlinkedActivities = unlinkedData?.activities || []

  // Get bookings grouped by itinerary for the link dropdown
  // Only show bookings that either:
  // 1. Have no linked activities (can accept any activity)
  // 2. Are from the same itinerary as the activity being linked
  const getBookingsForActivity = (activity: UnlinkedActivityDto) => {
    return allBookings.filter((booking) => {
      // Exclude cancelled bookings
      if (booking.proposalStatus === 'cancelled') return false
      // Bookings with no linked activities can accept any activity
      if (!booking.itineraryIds || booking.itineraryIds.length === 0) return true
      // Bookings must be from the same itinerary
      return booking.itineraryIds.includes(activity.itineraryId)
    })
  }

  return (
    <div className="space-y-6">
      {/* Totals Overview */}
      {totals && <BookingsTotalsCard totals={totals} currency={currency} />}

      {/* Unlinked Bookings Notice */}
      {showUnlinkedNotice && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>
            {unlinkedBookingsCount} booking{unlinkedBookingsCount > 1 ? 's' : ''} without linked
            activities {unlinkedBookingsCount > 1 ? 'are' : 'is'} hidden. View &quot;All
            Itineraries&quot; to see all bookings.
          </span>
        </div>
      )}

      {/* Bookings Table */}
      <div className="bg-white border border-gray-200 rounded-lg">
        {/* Header with Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Bookings</h2>
          <div className="flex items-center gap-2">
            {/* Generate Invoice Button */}
            <TripOrderGeneratorButton tripId={tripId} currency={currency} />

            {/* New Item Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  New Item
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>New</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleNewItem('package')}>
                  <Boxes className="h-4 w-4 mr-2" />
                  Package
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('flight')}>
                  <Plane className="h-4 w-4 mr-2" />
                  Flight
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('lodging')}>
                  <Hotel className="h-4 w-4 mr-2" />
                  Lodging
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('transportation')}>
                  <Car className="h-4 w-4 mr-2" />
                  Transportation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('tour')}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Activity
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('custom_cruise')}>
                  <Ship className="h-4 w-4 mr-2" />
                  Custom Cruise
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Table */}
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bookings Yet</h3>
            <p className="text-sm text-gray-500 text-center max-w-md mb-4">
              Bookings are created when you add activities with booking information.
              Use the &quot;New Item&quot; button above to add flights, hotels, tours, or other bookable activities.
            </p>
            {/* Quick action dropdown in empty state */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Package className="h-4 w-4 mr-2" />
                  Add First Booking
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuLabel>New</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleNewItem('package')}>
                  <Boxes className="h-4 w-4 mr-2" />
                  Package
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('flight')}>
                  <Plane className="h-4 w-4 mr-2" />
                  Flight
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('lodging')}>
                  <Hotel className="h-4 w-4 mr-2" />
                  Lodging
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('transportation')}>
                  <Car className="h-4 w-4 mr-2" />
                  Transportation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('tour')}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Activity
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewItem('custom_cruise')}>
                  <Ship className="h-4 w-4 mr-2" />
                  Custom Cruise
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="w-[28px] py-1.5 px-1"></TableHead>
                  <TableHead className="py-1.5 px-2">Name</TableHead>
                  <TableHead className="py-1.5 px-2">Confirmation #</TableHead>
                  <TableHead className="py-1.5 px-2">Supplier</TableHead>
                  <TableHead className="py-1.5 px-2">Status</TableHead>
                  <TableHead className="py-1.5 px-2">Payment</TableHead>
                  <TableHead className="py-1.5 px-2 text-right">Total</TableHead>
                  <TableHead className="py-1.5 px-2 text-center">Items</TableHead>
                  <TableHead className="w-[36px] py-1.5 px-1"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const isExpanded = expandedBookings.has(booking.id)
                  return (
                    <React.Fragment key={booking.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => router.push(`/trips/${tripId}/activities/${booking.id}/edit?type=package`)}
                      >
                        <TableCell className="w-[28px] px-1 py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={(e) => toggleExpand(booking.id, e)}
                            disabled={(booking.activityCount ?? 0) === 0}
                          >
                            {(booking.activityCount ?? 0) > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="h-2.5 w-2.5" />
                              ) : (
                                <ChevronRight className="h-2.5 w-2.5" />
                              )
                            ) : (
                              <span className="h-2.5 w-2.5" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-medium">{booking.name}</TableCell>
                        <TableCell className="py-1.5 px-2 text-gray-500">
                          {booking.confirmationNumber || '—'}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-gray-500">
                          {booking.supplierName || '—'}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <Badge variant={getPackageStatusVariant(booking.proposalStatus)} className="text-[10px] px-1 py-0 leading-tight">
                            {getPackageStatusLabel(booking.proposalStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <Badge variant={getPaymentStatusVariant(booking.paymentStatus ?? 'unpaid')} className="text-[10px] px-1 py-0 leading-tight">
                            {getPaymentStatusLabel(booking.paymentStatus ?? 'unpaid')}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-medium">
                          {formatCurrency(booking.totalPriceCents, booking.currency)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 leading-tight">{booking.activityCount}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-5 w-5">
                                <MoreHorizontal className="h-2.5 w-2.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/trips/${tripId}/activities/${booking.id}/edit?type=package`)
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleLinkActivities(booking.id)
                                }}
                              >
                                <Link2 className="h-4 w-4 mr-2" />
                                Link Activities
                              </DropdownMenuItem>
                              {['draft', 'proposing'].includes(booking.proposalStatus) && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleMarkAsBooked(booking)
                                  }}
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Mark as Booked
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteConfirm({ id: booking.id, name: booking.name })
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {/* Expanded activities row */}
                      {isExpanded && (
                        <ExpandedActivitiesRow
                          bookingId={booking.id}
                          colSpan={9}
                        />
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Unlinked Activities Section */}
      {unlinkedActivities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Activities Not in a Package ({unlinkedActivities.length})
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              These activities are not linked to any booking/package. Link them for better tracking and invoicing.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="py-1.5 px-2">Activity</TableHead>
                  <TableHead className="py-1.5 px-2">Type</TableHead>
                  <TableHead className="py-1.5 px-2">Day</TableHead>
                  <TableHead className="py-1.5 px-2 text-right">Cost</TableHead>
                  <TableHead className="py-1.5 px-2 w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unlinkedActivities.map((activity) => {
                  const availableBookings = getBookingsForActivity(activity)
                  return (
                    <TableRow key={activity.id}>
                      <TableCell className="py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <ActivityIconBadge type={activity.activityType} size="xs" />
                          <span className="font-medium">{activity.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 px-2 capitalize text-gray-500">
                        {activity.activityType.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-gray-500">
                        Day {activity.dayNumber}
                        {activity.date && (
                          <span className="text-[10px] ml-1">
                            ({new Date(activity.date).toLocaleDateString()})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right font-medium">
                        {activity.totalPriceCents !== null
                          ? formatCurrency(activity.totalPriceCents, currency)
                          : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={linkActivities.isPending}>
                              <Link2 className="h-2.5 w-2.5 mr-0.5" />
                              Link
                              <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {availableBookings.length > 0 ? (
                              <>
                                <DropdownMenuLabel>Available Packages</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {availableBookings.map((booking) => (
                                  <DropdownMenuItem
                                    key={booking.id}
                                    onClick={() => handleLinkUnlinkedActivity(activity.id, booking.id)}
                                  >
                                    <Package className="h-4 w-4 mr-2" />
                                    <div className="flex flex-col">
                                      <span className="truncate max-w-[180px]">{booking.name}</span>
                                      <span className="text-xs text-gray-500">
                                        {booking.activityCount} activities
                                      </span>
                                    </div>
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                              </>
                            ) : (
                              <>
                                <div className="px-2 py-1.5 text-sm text-gray-500">
                                  No compatible packages found
                                </div>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => router.push(`/trips/${tripId}/activities/new?type=package`)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Create New Package
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Activity Linker Sheet */}
      <ActivityLinkerSheet
        open={isLinkerOpen}
        onOpenChange={setIsLinkerOpen}
        tripId={tripId}
        bookingId={linkingBookingId}
      />

      {/* Mark as Booked Modal */}
      <MarkAsBookedModal
        open={isMarkAsBookedOpen}
        onOpenChange={setIsMarkAsBookedOpen}
        bookingId={markAsBookedTarget?.id || null}
        bookingName={markAsBookedTarget?.name || ''}
        currentStatus={markAsBookedTarget?.status || ''}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be undone.
              Linked activities will be unlinked but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBooking.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Totals Card Component
function BookingsTotalsCard({ totals, currency }: { totals: TripPackageTotalsDto; currency: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Overview</h2>
      <div className="grid grid-cols-5 gap-8">
        <div>
          <div className="text-sm text-gray-500 mb-1">Total Packages</div>
          <div className="text-2xl font-semibold text-gray-900">{totals.totalPackages}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Grand Total</div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatCurrency(totals.grandTotalCents, currency)}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Collected</div>
          <div className="text-2xl font-semibold text-green-600">
            {formatCurrency(totals.totalCollectedCents, currency)}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Outstanding</div>
          <div className="text-2xl font-semibold text-amber-600">
            {formatCurrency(totals.outstandingCents, currency)}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Commission</div>
          <div className="text-2xl font-semibold text-blue-600">
            {formatCurrency(totals.expectedCommissionCents, currency)}
            {totals.pendingCommissionCents > 0 && (
              <span className="text-sm text-gray-400 ml-1">
                (+{formatCurrency(totals.pendingCommissionCents, currency)} pending)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Skeleton
function BookingsListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Totals Skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-32 mb-6" />
        <div className="grid grid-cols-5 gap-8">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}
