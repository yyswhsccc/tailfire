'use client'

/**
 * Packages Table Component
 *
 * Unified three-level table for the Packages tab matching TERN design:
 * - Level 1: Packages (expandable)
 * - Level 2: Activities within packages, including Cruises (expandable if custom_cruise)
 * - Level 3: Ports nested under their parent cruise
 * - Standalone cruises are also expandable with ports nested
 * - Checkbox multi-select with action menu (Create Package, Add to Package, Remove from Package)
 * - Row click navigation to Package Editor or Activity edit
 *
 * Columns (TERN-style):
 * - Checkbox
 * - Item (type icon + name)
 * - Cost
 * - Supplier
 * - Confirmation #
 * - Payment status badge
 * - Commission/Status badge
 */

import React, { useState, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import type {
  PackageResponseDto,
  TripPackageTotalsDto,
  PackageLinkedActivityDto,
} from '@tailfire/shared-types'
import {
  useBookings,
  useTripBookingTotals,
  useUnlinkedActivities,
  useBookingLinkedActivities,
  useCreateBooking,
  useDeleteBooking,
  useLinkActivities,
  useUnlinkActivities,
  getPaymentStatusLabel,
  getPaymentStatusVariant,
} from '@/hooks/use-bookings'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Link2,
  Trash2,
  Unlink,
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
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

// ============================================================================
// Types
// ============================================================================

interface PackagesTableProps {
  tripId: string
  currency: string
  itineraryId?: string
  filterItineraryId?: string | null
}

type SelectionItem = {
  type: 'package' | 'activity'
  id: string
  name: string
  packageId?: string | null // For activities: which package they belong to
}

// Unified row type for mixed date-sorted display
type UnifiedBookingRow =
  | {
      kind: 'package'
      id: string
      name: string
      date: string | null
      totalPriceCents: number
      currency: string
      supplierName: string | null
      confirmationNumber: string | null
      paymentStatus: string
      status: string
      dateBooked: string | null
      activityCount: number
    }
  | {
      kind: 'activity'
      id: string
      name: string
      date: string | null
      activityType: string
      dayNumber: number | null
      totalPriceCents: number | null
      supplierName: string | null
      isBooked: boolean
      confirmationNumber: string | null
      paymentStatus: string | null
      currency: string | null
      children: UnlinkedActivity[]
    }

// ============================================================================
// Helpers
// ============================================================================

function getCommissionStatus(
  isBooked: boolean,
  status: string
): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (isBooked || status === 'confirmed') {
    return { label: 'Booked', variant: 'default' }
  }
  if (status === 'pending') {
    return { label: 'Upcoming', variant: 'secondary' }
  }
  return { label: 'Not Booked', variant: 'outline' }
}

// Sort unified rows by date (nulls at bottom)
function sortByDate(a: UnifiedBookingRow, b: UnifiedBookingRow): number {
  const dateA = a.date
  const dateB = b.date

  // Nulls go to the bottom
  if (!dateA && !dateB) return 0
  if (!dateA) return 1
  if (!dateB) return -1

  // Compare dates
  return dateA.localeCompare(dateB)
}

// ============================================================================
// Expanded Activities Row (lazy loaded)
// ============================================================================

const ExpandedPackageActivities = memo(function ExpandedPackageActivities({
  packageId,
  onActivityClick,
}: {
  packageId: string
  onActivityClick: (activityId: string) => void
}) {
  const { data: activities, isLoading, error } = useBookingLinkedActivities(packageId)

  // Track expanded cruises within this package
  const [expandedCruises, setExpandedCruises] = useState<Set<string>>(new Set())

  const toggleCruiseExpand = useCallback((cruiseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedCruises((prev) => {
      const next = new Set(prev)
      if (next.has(cruiseId)) {
        next.delete(cruiseId)
      } else {
        next.add(cruiseId)
      }
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={8} className="py-3 px-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 pl-10">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading linked activities...
          </div>
        </td>
      </tr>
    )
  }

  if (error) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={8} className="py-3 px-4">
          <div className="flex items-center gap-2 text-xs text-red-500 pl-10">
            <AlertCircle className="h-3 w-3" />
            Failed to load activities
          </div>
        </td>
      </tr>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={8} className="py-3 px-4">
          <div className="text-xs text-gray-500 pl-10">No activities linked to this package</div>
        </td>
      </tr>
    )
  }

  // Group by parent for hierarchical display
  const grouped = groupActivitiesByParent(activities)

  return (
    <>
      {grouped.map(({ activity, children }) => {
        const isCruise = activity.activityType === 'custom_cruise'
        const hasChildren = children.length > 0
        const isCruiseExpanded = expandedCruises.has(activity.id)

        return (
          <React.Fragment key={activity.id}>
            {/* Activity row (Level 2) */}
            <tr
              className="bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer border-t border-gray-100"
              onClick={() => onActivityClick(activity.id)}
            >
              <td className="py-2 px-4">
                {/* Expand button for cruises with children */}
                {isCruise && hasChildren && (
                  <button
                    onClick={(e) => toggleCruiseExpand(activity.id, e)}
                    className="ml-6 text-gray-400 hover:text-gray-600"
                  >
                    {isCruiseExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
              </td>
              <td className="py-2 px-4">
                <div className="flex items-center gap-2 pl-8">
                  <span className="text-gray-300">├</span>
                  <ActivityIconBadge type={activity.activityType} size="sm" />
                  <span className="text-xs text-gray-700">{activity.name}</span>
                  {activity.dayNumber && (
                    <Badge variant="outline" className="text-xs ml-auto">
                      Day {activity.dayNumber}
                    </Badge>
                  )}
                  {isCruise && hasChildren && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {children.length} port{children.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </td>
              <td className="py-2 px-4 text-xs text-gray-500">—</td>
              <td className="py-2 px-4 text-xs text-gray-500">—</td>
              <td className="py-2 px-4 text-xs text-gray-500">—</td>
              <td className="py-2 px-4">—</td>
              <td className="py-2 px-4">—</td>
              <td className="py-2 px-4"></td>
            </tr>
            {/* Children/Ports (Level 3) - only shown if cruise is expanded */}
            {isCruise && isCruiseExpanded && children.map((child, idx) => {
              const isLast = idx === children.length - 1
              return (
                <tr
                  key={child.id}
                  className="bg-gray-50/30 hover:bg-gray-100/30 cursor-pointer border-t border-gray-50"
                  onClick={() => onActivityClick(child.id)}
                >
                  <td className="py-1.5 px-4"></td>
                  <td className="py-1.5 px-4">
                    <div className="flex items-center gap-2 pl-16">
                      <span className="text-gray-200">{isLast ? '└' : '├'}</span>
                      <ActivityIconBadge type={child.activityType} size="xs" />
                      <span className="text-xs text-gray-600">{child.name}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-4 text-xs text-gray-400">—</td>
                  <td className="py-1.5 px-4 text-xs text-gray-400">—</td>
                  <td className="py-1.5 px-4 text-xs text-gray-400">—</td>
                  <td className="py-1.5 px-4">—</td>
                  <td className="py-1.5 px-4">—</td>
                  <td className="py-1.5 px-4"></td>
                </tr>
              )
            })}
          </React.Fragment>
        )
      })}
    </>
  )
})

// Sort helper: by dayNumber ascending then name alphabetically
function sortByDayThenName<T extends { dayNumber?: number | null; name: string }>(a: T, b: T): number {
  const dayA = a.dayNumber ?? Infinity
  const dayB = b.dayNumber ?? Infinity
  if (dayA !== dayB) return dayA - dayB
  return a.name.localeCompare(b.name)
}

function groupActivitiesByParent(activities: PackageLinkedActivityDto[]) {
  // Build a set of activity IDs that are in this list (direct children of the package)
  const activityIds = new Set(activities.map(a => a.id))

  // Build children map: group activities by their parent
  // Only consider it a "child" if the parent is ALSO in the activity list (i.e., a nested child like port under cruise)
  const childrenMap = new Map<string, PackageLinkedActivityDto[]>()

  for (const activity of activities) {
    // If this activity's parent is another activity in the list (not the package itself),
    // then it's a nested child (e.g., port_info under cruise)
    if (activity.parentActivityId && activityIds.has(activity.parentActivityId)) {
      const existing = childrenMap.get(activity.parentActivityId) || []
      existing.push(activity)
      childrenMap.set(activity.parentActivityId, existing)
    }
  }

  // Build result: top-level items are activities whose parent is the package (not another activity in the list)
  const result: { activity: PackageLinkedActivityDto; children: PackageLinkedActivityDto[] }[] = []
  for (const activity of activities) {
    // Skip if this activity's parent is another activity in the list (it's a nested child)
    if (activity.parentActivityId && activityIds.has(activity.parentActivityId)) continue
    result.push({
      activity,
      children: (childrenMap.get(activity.id) || []).sort(sortByDayThenName),
    })
  }
  // Sort top-level items by day number then name
  return result.sort((a, b) => sortByDayThenName(a.activity, b.activity))
}

// Type for unlinked activities (imported from shared-types includes parentActivityId)
type UnlinkedActivity = {
  id: string
  name: string
  activityType: string
  itineraryId: string
  itineraryDayId: string
  dayNumber: number | null
  date: string | null
  sequenceOrder: number
  totalPriceCents: number | null
  parentActivityId: string | null
  supplierName: string | null
  isBooked: boolean
  confirmationNumber: string | null
  paymentStatus: string | null
  paidCents: number | null
  currency: string | null
}

function groupUnlinkedByParent(activities: UnlinkedActivity[]) {
  const childrenMap = new Map<string, UnlinkedActivity[]>()

  for (const activity of activities) {
    if (activity.parentActivityId) {
      const existing = childrenMap.get(activity.parentActivityId) || []
      existing.push(activity)
      childrenMap.set(activity.parentActivityId, existing)
    }
  }

  const result: { activity: UnlinkedActivity; children: UnlinkedActivity[] }[] = []
  for (const activity of activities) {
    if (activity.parentActivityId) continue
    result.push({
      activity,
      children: (childrenMap.get(activity.id) || []).sort(sortByDayThenName),
    })
  }
  // Sort top-level items by day number then name
  return result.sort((a, b) => sortByDayThenName(a.activity, b.activity))
}

// ============================================================================
// Overview Card (Compact)
// ============================================================================

function OverviewCard({ totals, currency }: { totals: TripPackageTotalsDto; currency: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
      <div className="flex items-center gap-8 text-sm">
        <div>
          <span className="text-gray-500">Total cost</span>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(totals.grandTotalCents, currency)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Booked</span>
          <div className="text-lg font-semibold text-teal-600">
            {formatCurrency(totals.bookedTotalCents, currency)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Paid</span>
          <div className="text-lg font-semibold text-green-600">
            {formatCurrency(totals.totalCollectedCents, currency)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Unpaid</span>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(totals.outstandingCents, currency)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Exp. commission after split</span>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(totals.expectedCommissionCents, currency)}
          </div>
        </div>
      </div>
      {totals.pendingCommissionCents > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Expected commission doesn&apos;t include {formatCurrency(totals.pendingCommissionCents, currency)} from items not marked as booked
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Multi-Select Action Menu
// ============================================================================

function SelectionActionMenu({
  selectedItems,
  packages,
  tripId,
  onClearSelection,
}: {
  selectedItems: SelectionItem[]
  packages: Array<
    PackageResponseDto & {
      itineraryIds?: string[]
      activityCount?: number
      paymentStatus?: string
      supplierName?: string | null
      dateBooked?: string | null
    }
  >
  tripId: string
  onClearSelection: () => void
}) {
  const [isCreatePackageOpen, setIsCreatePackageOpen] = useState(false)
  const [isAddToPackageOpen, setIsAddToPackageOpen] = useState(false)
  const [newPackageName, setNewPackageName] = useState('')
  const { toast } = useToast()

  const createBooking = useCreateBooking()
  const linkActivities = useLinkActivities()
  const unlinkActivities = useUnlinkActivities()

  // Determine which actions are available
  const selectedActivities = selectedItems.filter((item) => item.type === 'activity')
  const activitiesInPackage = selectedActivities.filter((a) => a.packageId)
  const activitiesNotInPackage = selectedActivities.filter((a) => !a.packageId)

  const canCreatePackage = activitiesNotInPackage.length > 0
  const canAddToPackage = activitiesNotInPackage.length > 0 && packages.length > 0
  const canRemoveFromPackage = activitiesInPackage.length > 0

  const handleCreatePackage = async () => {
    if (!newPackageName.trim()) {
      toast({
        title: 'Package name required',
        description: 'Please enter a name for the new package.',
        variant: 'destructive',
      })
      return
    }

    try {
      const activityIds = activitiesNotInPackage.map((a) => a.id)
      const newPackage = await createBooking.mutateAsync({
        tripId,
        name: newPackageName.trim(),
        activityIds,
      })
      toast({
        title: 'Package created',
        description: `"${newPackage.name}" has been created with ${activityIds.length} activities.`,
      })
      setIsCreatePackageOpen(false)
      setNewPackageName('')
      onClearSelection()
    } catch (error) {
      toast({
        title: 'Failed to create package',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleAddToPackage = async (packageId: string, packageName: string) => {
    try {
      const activityIds = activitiesNotInPackage.map((a) => a.id)
      await linkActivities.mutateAsync({ bookingId: packageId, activityIds })
      toast({
        title: 'Activities linked',
        description: `${activityIds.length} activities added to "${packageName}".`,
      })
      setIsAddToPackageOpen(false)
      onClearSelection()
    } catch (error) {
      toast({
        title: 'Failed to link activities',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveFromPackage = async () => {
    try {
      // Group by packageId for batch unlink
      const byPackage = new Map<string, string[]>()
      for (const activity of activitiesInPackage) {
        if (activity.packageId) {
          const existing = byPackage.get(activity.packageId) || []
          existing.push(activity.id)
          byPackage.set(activity.packageId, existing)
        }
      }

      for (const [packageId, activityIds] of byPackage) {
        await unlinkActivities.mutateAsync({ bookingId: packageId, activityIds })
      }

      toast({
        title: 'Activities unlinked',
        description: `${activitiesInPackage.length} activities removed from packages.`,
      })
      onClearSelection()
    } catch (error) {
      toast({
        title: 'Failed to unlink activities',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const isPending = createBooking.isPending || linkActivities.isPending || unlinkActivities.isPending

  return (
    <>
      {/* Inline selection buttons - rendered in table header */}
      {selectedItems.length > 0 && (
        <>
          <Badge variant="secondary" className="text-xs">
            {selectedItems.length} selected
          </Badge>
          {canCreatePackage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreatePackageOpen(true)}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Package
            </Button>
          )}
          {canAddToPackage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddToPackageOpen(true)}
              disabled={isPending}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Add to Package
            </Button>
          )}
          {canRemoveFromPackage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveFromPackage}
              disabled={isPending}
            >
              <Unlink className="h-3 w-3 mr-1" />
              Remove from Package
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            Clear
          </Button>
          <div className="w-px h-6 bg-gray-200" />
        </>
      )}

      {/* Create Package Dialog */}
      <Dialog open={isCreatePackageOpen} onOpenChange={setIsCreatePackageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Package</DialogTitle>
            <DialogDescription>
              Create a new package with {activitiesNotInPackage.length} selected activities.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="package-name">Package Name</Label>
            <Input
              id="package-name"
              value={newPackageName}
              onChange={(e) => setNewPackageName(e.target.value)}
              placeholder="e.g., European Adventure"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreatePackageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePackage} disabled={createBooking.isPending}>
              {createBooking.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Package'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Package Dialog */}
      <Dialog open={isAddToPackageOpen} onOpenChange={setIsAddToPackageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Existing Package</DialogTitle>
            <DialogDescription>
              Select a package to add {activitiesNotInPackage.length} activities to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2 max-h-64 overflow-y-auto">
            {packages
              .filter((p) => p.status !== 'cancelled')
              .map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handleAddToPackage(pkg.id, pkg.name)}
                  disabled={linkActivities.isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
                >
                  <Boxes className="h-5 w-5 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{pkg.name}</div>
                    <div className="text-xs text-gray-500">
                      {pkg.activityCount ?? 0} activities &bull;{' '}
                      {formatCurrency(pkg.totalPriceCents, pkg.currency)}
                    </div>
                  </div>
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddToPackageOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PackagesTable({
  tripId,
  currency,
  itineraryId,
  filterItineraryId,
}: PackagesTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const deleteBooking = useDeleteBooking()

  // State
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set())
  const [expandedStandaloneCruises, setExpandedStandaloneCruises] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // Data fetching
  const { data: bookingsData, isLoading: bookingsLoading, error: bookingsError } = useBookings({ tripId })
  const { data: totals, isLoading: totalsLoading } = useTripBookingTotals(tripId)
  // Filter unlinked activities by the selected itinerary
  const { data: unlinkedData, isLoading: unlinkedLoading } = useUnlinkedActivities(tripId, itineraryId)

  // Derived data
  // Type assertion for runtime fields that may exist but aren't in the type definition
  const allPackages = useMemo(
    () =>
      (bookingsData || []) as Array<
        PackageResponseDto & {
          itineraryIds?: string[]
          activityCount?: number
          paymentStatus?: string
          supplierName?: string | null
          dateBooked?: string | null
        }
      >,
    [bookingsData]
  )
  // Filter packages by the selected itinerary if provided
  // Only show packages that have linked activities in the selected itinerary
  const packages = useMemo(() => {
    if (!filterItineraryId) return allPackages
    return allPackages.filter((pkg) => {
      // If package has itineraryIds, check if selected itinerary is included
      if (pkg.itineraryIds && pkg.itineraryIds.length > 0) {
        return pkg.itineraryIds.includes(filterItineraryId)
      }
      // If no itineraryIds, the package has no linked activities - show it anyway
      // (allows creating packages before linking activities)
      return true
    })
  }, [allPackages, filterItineraryId])

  const unlinkedActivities = useMemo(() => {
    return unlinkedData?.activities || []
  }, [unlinkedData])

  // Group unlinked activities by parent for cruise → port nesting
  const groupedUnlinkedActivities = useMemo(() => {
    return groupUnlinkedByParent(unlinkedActivities)
  }, [unlinkedActivities])

  // Create unified rows combining packages + unlinked activities, sorted by date
  const unifiedRows = useMemo((): UnifiedBookingRow[] => {
    const rows: UnifiedBookingRow[] = []

    // Add packages
    for (const pkg of packages) {
      rows.push({
        kind: 'package',
        id: pkg.id,
        name: pkg.name,
        date: pkg.dateBooked || null, // Use dateBooked for sorting packages
        totalPriceCents: pkg.totalPriceCents,
        currency: pkg.currency,
        supplierName: pkg.supplierName || null,
        confirmationNumber: pkg.confirmationNumber || null,
        paymentStatus: pkg.paymentStatus ?? 'unpaid',
        status: pkg.status,
        dateBooked: pkg.dateBooked || null,
        activityCount: pkg.activityCount ?? 0,
      })
    }

    // Add unlinked activities (top-level only, children are nested via groupedUnlinkedActivities)
    for (const { activity, children } of groupedUnlinkedActivities) {
      rows.push({
        kind: 'activity',
        id: activity.id,
        name: activity.name,
        date: activity.date,
        activityType: activity.activityType,
        dayNumber: activity.dayNumber,
        totalPriceCents: activity.totalPriceCents,
        supplierName: activity.supplierName ?? null,
        isBooked: activity.isBooked ?? false,
        confirmationNumber: activity.confirmationNumber ?? null,
        paymentStatus: activity.paymentStatus ?? null,
        currency: activity.currency ?? null,
        children,
      })
    }

    // Sort by date (nulls at bottom)
    return rows.sort(sortByDate)
  }, [packages, groupedUnlinkedActivities])

  // Toggle package expansion
  const togglePackageExpand = useCallback((packageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedPackages((prev) => {
      const next = new Set(prev)
      if (next.has(packageId)) {
        next.delete(packageId)
      } else {
        next.add(packageId)
      }
      return next
    })
  }, [])

  // Toggle standalone cruise expansion
  const toggleStandaloneCruiseExpand = useCallback((cruiseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedStandaloneCruises((prev) => {
      const next = new Set(prev)
      if (next.has(cruiseId)) {
        next.delete(cruiseId)
      } else {
        next.add(cruiseId)
      }
      return next
    })
  }, [])

  // Selection handlers
  const toggleSelection = useCallback((item: SelectionItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.id === item.id)
      if (existing) {
        return prev.filter((i) => i.id !== item.id)
      }
      return [...prev, item]
    })
  }, [])

  const isSelected = useCallback(
    (id: string) => selectedItems.some((item) => item.id === id),
    [selectedItems]
  )

  const clearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  // Navigation handlers
  const navigateToPackage = useCallback(
    (packageId: string) => {
      router.push(`/trips/${tripId}/activities/${packageId}/edit?type=package&tab=booking`)
    },
    [router, tripId]
  )

  const navigateToActivity = useCallback(
    (activityId: string) => {
      router.push(`/trips/${tripId}/activities/${activityId}/edit?tab=booking`)
    },
    [router, tripId]
  )

  // New Item handler
  const handleNewItem = useCallback(
    (type: string) => {
      if (type === 'package') {
        router.push(`/trips/${tripId}/activities/new?type=package`)
        return
      }
      const params = new URLSearchParams({ type, pendingDay: 'true' })
      if (itineraryId) params.set('itineraryId', itineraryId)
      router.push(`/trips/${tripId}/activities/new?${params.toString()}`)
    },
    [router, tripId, itineraryId]
  )

  // Delete package handler
  const handleDeletePackage = useCallback((id: string, name: string) => {
    setDeleteTarget({ id, name })
  }, [])

  const confirmDeletePackage = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteBooking.mutateAsync({ id: deleteTarget.id, tripId })
      toast({
        title: 'Package deleted',
        description: `"${deleteTarget.name}" has been deleted. Linked activities have been unlinked.`,
      })
      setDeleteTarget(null)
    } catch (error) {
      toast({
        title: 'Failed to delete package',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }, [deleteTarget, deleteBooking, tripId, toast])

  // Loading state
  if (bookingsLoading || totalsLoading || unlinkedLoading) {
    return <PackagesTableSkeleton />
  }

  // Error state
  if (bookingsError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Bookings</h3>
        <p className="text-sm text-gray-500">Please try refreshing the page.</p>
      </div>
    )
  }

  const hasItems = packages.length > 0 || unlinkedActivities.length > 0

  return (
    <div className="space-y-4">
      {/* Overview Card */}
      {totals && <OverviewCard totals={totals} currency={currency} />}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Bookings</h2>
          <div className="flex items-center gap-2">
            <SelectionActionMenu
              selectedItems={selectedItems}
              packages={allPackages}
              tripId={tripId}
              onClearSelection={clearSelection}
            />
            <TripOrderGeneratorButton tripId={tripId} currency={currency} />
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

        {/* Empty State */}
        {!hasItems && (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bookings Yet</h3>
            <p className="text-sm text-gray-500 text-center max-w-md mb-4">
              Use the &quot;New Item&quot; button above to add flights, hotels, tours, or other bookable activities.
            </p>
            <Button onClick={() => handleNewItem('package')}>
              <Boxes className="h-4 w-4 mr-2" />
              Create First Package
            </Button>
          </div>
        )}

        {/* Table Content */}
        {hasItems && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confirmation #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission
                  </th>
                  <th className="w-10 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Unified Rows - sorted by date */}
                {unifiedRows.map((row) => {
                  if (row.kind === 'package') {
                    // Package row
                    const isExpanded = expandedPackages.has(row.id)
                    const hasActivities = row.activityCount > 0
                    const commissionStatus = getCommissionStatus(
                      row.dateBooked != null,
                      row.status
                    )

                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={cn(
                            'hover:bg-gray-50 cursor-pointer',
                            isSelected(row.id) && 'bg-blue-50'
                          )}
                          onClick={() => navigateToPackage(row.id)}
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelection(
                                { type: 'package', id: row.id, name: row.name },
                                e
                              )
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isSelected(row.id)}
                                onCheckedChange={() => {}}
                              />
                              {hasActivities && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePackageExpand(row.id, e)
                                  }}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-amber-100 rounded">
                                <Boxes className="h-4 w-4 text-amber-600" />
                              </div>
                              <span className="text-sm font-medium text-gray-900">{row.name}</span>
                              {row.dateBooked ? (
                                <Badge variant="outline" className="text-xs ml-2">
                                  {new Date(row.dateBooked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs ml-2 text-gray-400">
                                  No date
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatCurrency(row.totalPriceCents, row.currency)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{row.supplierName || '–'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{row.confirmationNumber || '–'}</td>
                          <td className="px-4 py-3">
                            <Badge variant={getPaymentStatusVariant(row.paymentStatus) as any}>
                              {getPaymentStatusLabel(row.paymentStatus)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={commissionStatus.variant as any}>
                              {commissionStatus.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigateToPackage(row.id)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Package
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeletePackage(row.id, row.name)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Package
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {/* Expanded activities */}
                        {isExpanded && hasActivities && (
                          <ExpandedPackageActivities
                            packageId={row.id}
                            onActivityClick={navigateToActivity}
                          />
                        )}
                      </React.Fragment>
                    )
                  } else {
                    // Activity row
                    const isCruise = row.activityType === 'custom_cruise'
                    const hasChildren = row.children.length > 0
                    const isCruiseExpanded = expandedStandaloneCruises.has(row.id)

                    return (
                      <React.Fragment key={row.id}>
                        {/* Parent activity row */}
                        <tr
                          className={cn(
                            'hover:bg-gray-50 cursor-pointer',
                            isSelected(row.id) && 'bg-blue-50'
                          )}
                          onClick={() => navigateToActivity(row.id)}
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelection(
                                {
                                  type: 'activity',
                                  id: row.id,
                                  name: row.name,
                                  packageId: null,
                                },
                                e
                              )
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isSelected(row.id)}
                                onCheckedChange={() => {}}
                              />
                              {/* Expand button for standalone cruises with ports */}
                              {isCruise && hasChildren && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleStandaloneCruiseExpand(row.id, e)
                                  }}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  {isCruiseExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <ActivityIconBadge type={row.activityType} size="md" />
                              <span className="text-sm font-medium text-gray-900">{row.name}</span>
                              {row.dayNumber ? (
                                <Badge variant="outline" className="text-xs ml-2">
                                  Day {row.dayNumber}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs ml-2 text-gray-400">
                                  No date
                                </Badge>
                              )}
                              {isCruise && hasChildren && (
                                <Badge variant="secondary" className="text-xs ml-1">
                                  {row.children.length} port{row.children.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatCurrency(row.totalPriceCents ?? 0, currency)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{row.supplierName || '–'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{row.confirmationNumber || '–'}</td>
                          <td className="px-4 py-3">
                            {row.paymentStatus ? (
                              <Badge variant={getPaymentStatusVariant(row.paymentStatus) as any}>
                                {getPaymentStatusLabel(row.paymentStatus)}
                              </Badge>
                            ) : (
                              <span className="text-sm text-gray-400">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={row.isBooked ? 'default' : 'outline'}>
                              {row.isBooked ? 'Booked' : 'Not Booked'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3"></td>
                        </tr>
                        {/* Child ports (Level 2 under standalone cruise) */}
                        {isCruise && isCruiseExpanded && row.children.map((child, idx) => {
                          const isLast = idx === row.children.length - 1
                          return (
                            <tr
                              key={child.id}
                              className={cn(
                                'bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer border-t border-gray-100',
                                isSelected(child.id) && 'bg-blue-50'
                              )}
                              onClick={() => navigateToActivity(child.id)}
                            >
                              <td
                                className="px-4 py-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSelection(
                                    {
                                      type: 'activity',
                                      id: child.id,
                                      name: child.name,
                                      packageId: null,
                                    },
                                    e
                                  )
                                }}
                              >
                                <div className="pl-6">
                                  <Checkbox
                                    checked={isSelected(child.id)}
                                    onCheckedChange={() => {}}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2 pl-8">
                                  <span className="text-gray-300">{isLast ? '└' : '├'}</span>
                                  <ActivityIconBadge type={child.activityType} size="sm" />
                                  <span className="text-xs text-gray-700">{child.name}</span>
                                  {child.dayNumber && (
                                    <Badge variant="outline" className="text-xs ml-auto">
                                      Day {child.dayNumber}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {formatCurrency(child.totalPriceCents ?? 0, currency)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{child.supplierName || '–'}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">{child.confirmationNumber || '–'}</td>
                              <td className="px-4 py-2">
                                {child.paymentStatus ? (
                                  <Badge variant={getPaymentStatusVariant(child.paymentStatus) as any} className="text-xs">
                                    {getPaymentStatusLabel(child.paymentStatus)}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-gray-400">–</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <Badge variant={child.isBooked ? 'default' : 'outline'} className="text-xs">
                                  {child.isBooked ? 'Booked' : 'Not Booked'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2"></td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  }
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Package Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Package</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? Linked activities will be unlinked but not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeletePackage}
              disabled={deleteBooking.isPending}
            >
              {deleteBooking.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Package'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

function PackagesTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Overview skeleton */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="flex items-center gap-8">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-6 space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
