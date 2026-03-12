'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users,
  MapPin,
  Calendar,
  Hash,
  Trash2,
  AlertTriangle,
  LayoutDashboard,
  DollarSign,
  StickyNote,
  FileText,
  Image,
  Pencil,
} from 'lucide-react'
import { DetailLayout } from '@/components/layout'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { EmptyState } from '@/components/shared/empty-state'
import { DocumentUploader } from '@/components/document-uploader'
import { GroupMediaTab } from './_components/group-media-tab'
import { NotesSection } from '@/components/notes/NotesSection'
import { GroupFormDialog } from '../../_components/group-form-dialog'
import {
  useTripGroups,
  useTripsByGroup,
  useGroupTravelers,
  useGroupSummary,
  useRemoveTripFromGroup,
  useUpdateGroupStatus,
} from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/pricing/currency-helpers'
import { formatDate } from '@/lib/utils'
import type { TripGroupStatus } from '@tailfire/shared-types/api'

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

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

// ============================================================================
// AVATAR HELPERS (copied from trip-overview.tsx)
// ============================================================================

function getInitials(name: string) {
  const parts = name.split(' ')
  const lastPart = parts[parts.length - 1]
  if (parts.length >= 2 && parts[0]?.[0] && lastPart?.[0]) {
    return `${parts[0][0]}${lastPart[0]}`.toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-teal-600',
  'bg-blue-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-amber-700',
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-cyan-700',
]

function getAvatarColor(identifier: string): string {
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? 'bg-teal-600'
}

// ============================================================================
// SIDEBAR NAV
// ============================================================================

type GroupTab = 'overview' | 'finances' | 'notes' | 'documents' | 'media'

const getSidebarNav = (activeTab: GroupTab, setActiveTab: (tab: GroupTab) => void) => [
  {
    title: 'General',
    items: [
      {
        name: 'Overview',
        href: '#overview',
        icon: LayoutDashboard,
        isActive: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
    ],
  },
  {
    title: 'Finances',
    items: [
      {
        name: 'Summary',
        href: '#finances',
        icon: DollarSign,
        isActive: activeTab === 'finances',
        onClick: () => setActiveTab('finances'),
      },
    ],
  },
  {
    title: 'More',
    items: [
      {
        name: 'Notes',
        href: '#notes',
        icon: StickyNote,
        isActive: activeTab === 'notes',
        onClick: () => setActiveTab('notes'),
      },
      {
        name: 'Documents',
        href: '#documents',
        icon: FileText,
        isActive: activeTab === 'documents',
        onClick: () => setActiveTab('documents'),
      },
      {
        name: 'Media',
        href: '#media',
        icon: Image,
        isActive: activeTab === 'media',
        onClick: () => setActiveTab('media'),
      },
    ],
  },
]

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  // Data hooks
  const { data: groups, isLoading: groupsLoading } = useTripGroups()
  const { data: trips } = useTripsByGroup(groupId)
  const { data: groupTravelers } = useGroupTravelers(groupId)
  const { data: summary } = useGroupSummary(groupId)
  const removeTripFromGroup = useRemoveTripFromGroup()
  const updateGroupStatus = useUpdateGroupStatus()

  // Dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Tab state with URL sync (matching trip detail pattern)
  const initialTab = searchParams.get('tab') as GroupTab | null
  const validTabs: GroupTab[] = ['overview', 'finances', 'notes', 'documents', 'media']
  const [activeTab, setActiveTab] = useState<GroupTab>(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview'
  )
  const lastUrlTab = useRef<string | null>(initialTab)

  const handleTabChange = useCallback((tab: GroupTab) => {
    setActiveTab(tab)
    lastUrlTab.current = tab === 'overview' ? null : tab
    const newUrl = tab === 'overview'
      ? `/trips/groups/${groupId}`
      : `/trips/groups/${groupId}?tab=${tab}`
    router.replace(newUrl, { scroll: false })
  }, [groupId, router])

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    if (tabFromUrl !== lastUrlTab.current) {
      lastUrlTab.current = tabFromUrl
      const newTab = tabFromUrl && validTabs.includes(tabFromUrl as GroupTab) ? (tabFromUrl as GroupTab) : 'overview'
      setActiveTab(newTab)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const group = groups?.find((g) => g.id === groupId)

  // Loading state
  if (groupsLoading) {
    return (
      <DetailLayout
        backHref="/trips"
        backLabel="Trips"
        sidebarSections={getSidebarNav('overview', () => {})}
      >
        <div className="p-6">
          <p className="text-muted-foreground">Loading group...</p>
        </div>
      </DetailLayout>
    )
  }

  // Not found
  if (!group) {
    return (
      <DetailLayout
        backHref="/trips"
        backLabel="Trips"
        sidebarSections={getSidebarNav('overview', () => {})}
      >
        <div className="p-6">
          <p className="text-muted-foreground">Group not found.</p>
        </div>
      </DetailLayout>
    )
  }

  const isGroupBooking = group.type === 'group_booking'
  const currency = summary?.currency || 'CAD'

  const handleCancelGroup = async () => {
    try {
      const result = await updateGroupStatus.mutateAsync({
        groupId,
        status: 'cancelled',
        reason: cancelReason,
      })
      const data = (result as any)?.data || result
      const cancelledCount = (data as any)?.cancelled?.length || 0
      const skippedCount = (data as any)?.skipped?.length || 0
      toast({
        title: cancelledCount > 0 ? 'Group Cancelled' : 'No Trips Cancelled',
        description: cancelledCount > 0
          ? `${cancelledCount} trip(s) cancelled${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}.`
          : `All ${skippedCount} trip(s) could not be cancelled.`,
        variant: cancelledCount === 0 ? 'destructive' : undefined,
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

  // ============================================================================
  // TAB CONTENT RENDERER
  // ============================================================================

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 columns - Group Info + Trips */}
            <div className="lg:col-span-2 space-y-6">
              {/* Group Info Card */}
              {isGroupBooking && (
                <Card className="p-6">
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
                            {group.startDate && formatDate(group.startDate)}
                            {group.startDate && group.endDate && ' - '}
                            {group.endDate && formatDate(group.endDate)}
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
                  {group.description && (
                    <p className="text-sm text-muted-foreground mt-4">{group.description}</p>
                  )}
                </Card>
              )}

              {/* Individual Trips */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-ash-900 mb-4">
                  Trips ({trips?.length ?? 0})
                </h2>
                <div className="space-y-2">
                  {trips?.map((trip) => (
                    <div
                      key={trip.id}
                      className="border rounded-lg p-3 hover:bg-accent/50 transition-colors flex items-center gap-2"
                    >
                      <Link
                        href={`/trips/${trip.id}`}
                        className="flex-1 flex items-center gap-4"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{trip.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {trip.primaryContactFirstName && trip.primaryContactLastName
                              ? `${trip.primaryContactFirstName} ${trip.primaryContactLastName}`
                              : trip.primaryContactFirstName || ''}
                            {trip.startDate && (
                              <>
                                {(trip.primaryContactFirstName || trip.primaryContactLastName) && ' \u2022 '}
                                {formatDate(trip.startDate)}
                                {trip.endDate && ` \u2013 ${formatDate(trip.endDate)}`}
                              </>
                            )}
                          </p>
                        </div>
                        <TripStatusBadge status={trip.status} />
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault()
                          handleRemoveTrip(trip.id)
                        }}
                        disabled={removeTripFromGroup.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {(!trips || trips.length === 0) && (
                    <p className="text-muted-foreground text-sm py-4 text-center">
                      No trips in this group yet.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* Right column - Travelers + Group Details */}
            <div className="space-y-6">
              {/* Travelers Card */}
              <Card className="p-6">
                <h3 className="font-semibold text-ash-900 mb-4">
                  Travelers ({groupTravelers?.length ?? 0})
                </h3>
                {groupTravelers && groupTravelers.length > 0 ? (
                  <div className="space-y-1">
                    {groupTravelers.map((traveler) => {
                      const name = `${traveler.firstName ?? ''} ${traveler.lastName ?? ''}`.trim() || 'Unknown'
                      return (
                        <div key={traveler.travelerId} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={`${getAvatarColor(traveler.contactId ?? traveler.travelerId)} text-white text-xs`}>
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            {traveler.contactId ? (
                              <Link
                                href={`/contacts/${traveler.contactId}`}
                                className="text-sm font-semibold hover:underline block truncate"
                              >
                                {name}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold block truncate">{name}</span>
                            )}
                            <p className="text-xs text-muted-foreground truncate">{traveler.tripName}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No travelers yet.
                  </p>
                )}
              </Card>

              {/* Group Details Card */}
              {isGroupBooking && (
                <Card className="p-6">
                  <h3 className="font-semibold text-ash-900 mb-4">Group Details</h3>
                  <dl className="space-y-3 text-sm">
                    {group.groupNumber && (
                      <div>
                        <dt className="text-muted-foreground">Group Number</dt>
                        <dd className="font-medium">{group.groupNumber}</dd>
                      </div>
                    )}
                    {group.destination && (
                      <div>
                        <dt className="text-muted-foreground">Destination</dt>
                        <dd className="font-medium">{group.destination}</dd>
                      </div>
                    )}
                    {group.description && (
                      <div>
                        <dt className="text-muted-foreground">Description</dt>
                        <dd className="font-medium">{group.description}</dd>
                      </div>
                    )}
                  </dl>
                </Card>
              )}
            </div>
          </div>
        )

      case 'finances':
        if (!isGroupBooking || !summary) {
          return (
            <EmptyState
              title="No financial data"
              description="Financial summary is only available for group bookings with trips."
            />
          )
        }
        return (
          <div className="space-y-6">
            {/* Group Financial Summary */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-ash-900 mb-4">Financial Summary</h2>
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
            </Card>

            {/* Per-Trip Breakdown */}
            {summary.tripSummaries && summary.tripSummaries.length > 0 && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-ash-900 mb-4">Per-Trip Breakdown</h2>
                <div className="space-y-3">
                  {summary.tripSummaries.map((ts) => (
                    <div key={ts.tripId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Link href={`/trips/${ts.tripId}`} className="font-medium hover:underline">
                          {ts.tripName}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge variant={ts.paymentStatus === 'paid' ? 'booked' : ts.paymentStatus === 'partial' ? 'planning' : 'outline'}>
                            {ts.paymentStatus}
                          </Badge>
                          <TripStatusBadge status={ts.status} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Package</p>
                          <p className="font-medium">{formatCurrency(ts.packagePriceCents, currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Comm. Projected</p>
                          <p className="font-medium">{formatCurrency(ts.commissionProjectedCents, currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Comm. Received</p>
                          <p className="font-medium">{formatCurrency(ts.commissionReceivedCents, currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Balance</p>
                          <p className="font-medium">{formatCurrency(ts.balanceCents, currency)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )

      case 'notes':
        return (
          <NotesSection tripGroupId={groupId} />
        )

      case 'documents':
        return (
          <DocumentUploader
            resourceId={groupId}
            endpointPath="/trips/groups/{id}/documents"
            queryKey={['group-documents', groupId]}
          />
        )

      case 'media':
        return (
          <GroupMediaTab groupId={groupId} />
        )

      default:
        return null
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DetailLayout
      backHref="/trips"
      backLabel="Trips"
      sidebarSections={getSidebarNav(activeTab, handleTabChange)}
    >
      <div className="p-6">
        {/* Header - matching trip detail style */}
        <div className="border-b border-ash-200 pb-4 mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold leading-tight text-ash-900">{group.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <Badge variant="outline">{isGroupBooking ? 'Group Booking' : 'Folder'}</Badge>
              {isGroupBooking && <GroupStatusBadge status={group.status} />}
              {group.startDate && (
                <>
                  <span className="text-ash-300">&bull;</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {formatDate(group.startDate)}
                      {group.endDate && ` \u2013 ${formatDate(group.endDate)}`}
                    </span>
                  </div>
                </>
              )}
              <span className="text-ash-300">&bull;</span>
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>{trips?.length ?? 0} trips</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
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
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>

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

      {/* Edit Group Dialog */}
      <GroupFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode="edit"
        group={group}
      />
    </DetailLayout>
  )
}
