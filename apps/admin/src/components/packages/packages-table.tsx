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
 * - Commission amount
 */

import React, { useState, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import type {
  PackageResponseDto,
  TripPackageTotalsDto,
  PackageLinkedActivityDto,
  TravelerBookingDto,
} from '@tailfire/shared-types'
import {
  useBookings,
  useTripBookingTotals,
  useUnlinkedActivities,
  useBookingLinkedActivities,
  useTripTravelerBookings,
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
  User,
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
      proposalStatus: string
      dateBooked: string | null
      activityCount: number
      commissionTotalCents: number | null
      travelerBookings: TravelerBookingDto[]
    }
  | {
      kind: 'activity'
      id: string
      name: string
      date: string | null
      activityType: string
      dayNumber: number | null
      endDayNumber: number | null
      totalPriceCents: number | null
      supplierName: string | null
      bookingStatus: string
      confirmationNumber: string | null
      paymentStatus: string | null
      currency: string | null
      commissionTotalCents: number | null
      children: UnlinkedActivity[]
      travelerBookings: TravelerBookingDto[]
    }

// ============================================================================
// Helpers
// ============================================================================

// Activity type priority maps for day-aware ordering
// First day: Flight → Transfer → Lodging → Cruise → Port → Other
const FIRST_DAY_PRIORITY: Record<string, number> = {
  flight: 1,
  transportation: 2,
  lodging: 3,
  custom_cruise: 4,
  port_info: 5,
}
// Last day: Cruise → Lodging → Transfer → Other → Flight (always last)
const LAST_DAY_PRIORITY: Record<string, number> = {
  custom_cruise: 1,
  lodging: 2,
  transportation: 3,
  flight: 99, // Always last on departure day
}
// Middle days: default ordering
const MIDDLE_DAY_PRIORITY: Record<string, number> = {
  custom_cruise: 1,
  lodging: 2,
  flight: 3,
  transportation: 4,
  port_info: 5,
}
const DEFAULT_PRIORITY = 50

function getActivityTypePriority(
  activityType: string,
  dayNumber: number | null,
  firstDay: number,
  lastDay: number
): number {
  if (dayNumber == null) return DEFAULT_PRIORITY
  if (dayNumber === firstDay) return FIRST_DAY_PRIORITY[activityType] ?? DEFAULT_PRIORITY
  if (dayNumber === lastDay) return LAST_DAY_PRIORITY[activityType] ?? DEFAULT_PRIORITY
  return MIDDLE_DAY_PRIORITY[activityType] ?? DEFAULT_PRIORITY
}

// Sort unified rows by date then activity type priority
function sortUnifiedRows(
  rows: UnifiedBookingRow[],
  firstDay: number,
  lastDay: number
): UnifiedBookingRow[] {
  return [...rows].sort((a, b) => {
    // 1. Sort by date (nulls at bottom)
    const dateA = a.date
    const dateB = b.date
    if (!dateA && !dateB) {
      // both null — compare by name
    } else if (!dateA) return 1
    else if (!dateB) return -1
    else {
      const dateCompare = dateA.localeCompare(dateB)
      if (dateCompare !== 0) return dateCompare
    }

    // 2. Within same date, sort activities by type priority
    if (a.kind === 'activity' && b.kind === 'activity') {
      const dayA = a.dayNumber ?? Infinity
      const dayB = b.dayNumber ?? Infinity
      if (dayA !== dayB) return dayA - dayB
      const priA = getActivityTypePriority(a.activityType, a.dayNumber, firstDay, lastDay)
      const priB = getActivityTypePriority(b.activityType, b.dayNumber, firstDay, lastDay)
      if (priA !== priB) return priA - priB
    }

    // 3. Packages before activities at same date
    if (a.kind !== b.kind) return a.kind === 'package' ? -1 : 1

    return a.name.localeCompare(b.name)
  })
}

// Format day badge label with optional spanning (e.g., "Day 1" or "Day 1-8")
// Only lodging and custom_cruise activity types can show day spans
const SPAN_ELIGIBLE_TYPES = new Set(['lodging', 'custom_cruise'])
function formatDayLabel(dayNumber: number | null | undefined, endDayNumber?: number | null, activityType?: string): string | null {
  if (dayNumber == null) return null
  if (endDayNumber != null && endDayNumber > dayNumber && activityType && SPAN_ELIGIBLE_TYPES.has(activityType))
    return `Day ${dayNumber}-${endDayNumber}`
  return `Day ${dayNumber}`
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

  // Compute first/last day from activity placement (not spans) for type-priority ordering
  const dayNumbers = activities.map(a => a.dayNumber).filter((d): d is number => d != null)
  const pkgFirstDay = dayNumbers.length > 0 ? Math.min(...dayNumbers) : 1
  const pkgLastDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 1

  // Group by parent for hierarchical display
  const grouped = groupActivitiesByParent(activities, pkgFirstDay, pkgLastDay)

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
                  {activity.dayNumber != null && (
                    <Badge variant="outline" className="text-xs ml-auto">
                      {formatDayLabel(activity.dayNumber, activity.endDayNumber, activity.activityType)}
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

// Sort helper: by dayNumber ascending, then activity type priority, then name
function sortByDayThenType<T extends { dayNumber?: number | null; name: string; activityType?: string }>(
  a: T,
  b: T,
  firstDay: number,
  lastDay: number
): number {
  const dayA = a.dayNumber ?? Infinity
  const dayB = b.dayNumber ?? Infinity
  if (dayA !== dayB) return dayA - dayB
  // Within same day, sort by activity type priority
  if (a.activityType && b.activityType) {
    const priA = getActivityTypePriority(a.activityType, a.dayNumber ?? null, firstDay, lastDay)
    const priB = getActivityTypePriority(b.activityType, b.dayNumber ?? null, firstDay, lastDay)
    if (priA !== priB) return priA - priB
  }
  return a.name.localeCompare(b.name)
}

function groupActivitiesByParent(
  activities: PackageLinkedActivityDto[],
  firstDay: number,
  lastDay: number,
) {
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
      children: (childrenMap.get(activity.id) || []).sort((a, b) => sortByDayThenType(a, b, firstDay, lastDay)),
    })
  }
  // Sort top-level items by day then type priority
  return result.sort((a, b) => sortByDayThenType(a.activity, b.activity, firstDay, lastDay))
}

// Type for unlinked activities (imported from shared-types includes parentActivityId)
type UnlinkedActivity = {
  id: string
  name: string
  activityType: string
  itineraryId: string
  itineraryDayId: string
  dayNumber: number | null
  endDayNumber: number | null
  date: string | null
  sequenceOrder: number
  totalPriceCents: number | null
  parentActivityId: string | null
  supplierName: string | null
  bookingStatus: string
  confirmationNumber: string | null
  paymentStatus: string | null
  paidCents: number | null
  currency: string | null
  commissionTotalCents: number | null
}

function groupUnlinkedByParent(
  activities: UnlinkedActivity[],
  firstDay: number,
  lastDay: number,
) {
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
      children: (childrenMap.get(activity.id) || []).sort((a, b) => sortByDayThenType(a, b, firstDay, lastDay)),
    })
  }
  // Sort top-level items by day then type priority
  return result.sort((a, b) => sortByDayThenType(a.activity, b.activity, firstDay, lastDay))
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
              .filter((p) => p.proposalStatus !== 'cancelled')
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
  // Batch-fetch all per-traveler bookings for the trip
  const { data: tripTravelerBookings } = useTripTravelerBookings(tripId)

  // Build activityId → traveler bookings map
  const travelerBookingsByActivity = useMemo(() => {
    const map = new Map<string, TravelerBookingDto[]>()
    if (!tripTravelerBookings) return map
    for (const tb of tripTravelerBookings) {
      const existing = map.get(tb.activityId) || []
      existing.push(tb)
      map.set(tb.activityId, existing)
    }
    return map
  }, [tripTravelerBookings])

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

  // Compute first and last day numbers from activity placement (not spans)
  // lastDay = last day that has activities, used for type-priority ordering
  const { firstDay, lastDay } = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const a of unlinkedActivities) {
      if (a.dayNumber != null) {
        if (a.dayNumber < min) min = a.dayNumber
        if (a.dayNumber > max) max = a.dayNumber
      }
    }
    return { firstDay: min === Infinity ? 1 : min, lastDay: max === -Infinity ? 1 : max }
  }, [unlinkedActivities])

  // Group unlinked activities by parent for cruise → port nesting
  const groupedUnlinkedActivities = useMemo(() => {
    return groupUnlinkedByParent(unlinkedActivities, firstDay, lastDay)
  }, [unlinkedActivities, firstDay, lastDay])

  // Create unified rows combining packages + unlinked activities, sorted by date then activity type
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
        proposalStatus: pkg.proposalStatus,
        dateBooked: pkg.dateBooked || null,
        activityCount: pkg.activityCount ?? 0,
        commissionTotalCents: pkg.pricing?.commissionTotalCents ?? null,
        travelerBookings: travelerBookingsByActivity.get(pkg.id) || [],
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
        endDayNumber: activity.endDayNumber ?? null,
        totalPriceCents: activity.totalPriceCents,
        supplierName: activity.supplierName ?? null,
        bookingStatus: activity.bookingStatus ?? 'unbooked',
        confirmationNumber: activity.confirmationNumber ?? null,
        paymentStatus: activity.paymentStatus ?? null,
        currency: activity.currency ?? null,
        commissionTotalCents: activity.commissionTotalCents ?? null,
        children,
        travelerBookings: travelerBookingsByActivity.get(activity.id) || [],
      })
    }

    return sortUnifiedRows(rows, firstDay, lastDay)
  }, [packages, groupedUnlinkedActivities, travelerBookingsByActivity, firstDay, lastDay])

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
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.commissionTotalCents
                              ? formatCurrency(row.commissionTotalCents, row.currency)
                              : '–'}
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
                        {/* Per-traveler booking sub-rows for packages */}
                        {row.travelerBookings.length > 0 && row.travelerBookings.map((tb, idx) => {
                          const isLast = idx === row.travelerBookings.length - 1
                          return (
                            <tr
                              key={`tb-${tb.id}`}
                              className="bg-blue-50/30 border-t border-gray-100"
                            >
                              <td className="px-4 py-2">
                                <div className="pl-6" />
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2 pl-4">
                                  <span className="text-gray-300">{isLast ? '└' : '├'}</span>
                                  <User className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="text-xs text-gray-700">{tb.travelerName}</span>
                                  <Badge variant="outline" className="text-xs">Booking</Badge>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {tb.priceCents != null ? formatCurrency(tb.priceCents, tb.currency || currency) : '–'}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{tb.supplier || '–'}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">{tb.confirmationNumber || '–'}</td>
                              <td className="px-4 py-2">
                                {tb.bookingStatus ? (
                                  <Badge variant="secondary" className="text-xs">{tb.bookingStatus}</Badge>
                                ) : (
                                  <span className="text-xs text-gray-400">–</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {tb.commissionCents
                                  ? formatCurrency(tb.commissionCents, tb.currency || currency)
                                  : '–'}
                              </td>
                              <td className="px-4 py-2"></td>
                            </tr>
                          )
                        })}
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
                              {row.dayNumber != null ? (
                                <Badge variant="outline" className="text-xs ml-2">
                                  {formatDayLabel(row.dayNumber, row.endDayNumber, row.activityType)}
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
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.commissionTotalCents
                              ? formatCurrency(row.commissionTotalCents, row.currency || 'CAD')
                              : '–'}
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
                                  {child.dayNumber != null && (
                                    <Badge variant="outline" className="text-xs ml-auto">
                                      {formatDayLabel(child.dayNumber, child.endDayNumber, child.activityType)}
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
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {child.commissionTotalCents
                                  ? formatCurrency(child.commissionTotalCents, child.currency || 'CAD')
                                  : '–'}
                              </td>
                              <td className="px-4 py-2"></td>
                            </tr>
                          )
                        })}
                        {/* Per-traveler booking sub-rows */}
                        {row.travelerBookings.length > 0 && row.travelerBookings.map((tb, idx) => {
                          const isLast = idx === row.travelerBookings.length - 1
                          return (
                            <tr
                              key={`tb-${tb.id}`}
                              className="bg-blue-50/30 border-t border-gray-100"
                            >
                              <td className="px-4 py-2">
                                <div className="pl-6" />
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2 pl-4">
                                  <span className="text-gray-300">{isLast ? '└' : '├'}</span>
                                  <User className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="text-xs text-gray-700">{tb.travelerName}</span>
                                  <Badge variant="outline" className="text-xs">Booking</Badge>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {tb.priceCents != null ? formatCurrency(tb.priceCents, tb.currency || currency) : '–'}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{tb.supplier || '–'}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">{tb.confirmationNumber || '–'}</td>
                              <td className="px-4 py-2">
                                {tb.bookingStatus ? (
                                  <Badge variant="secondary" className="text-xs">{tb.bookingStatus}</Badge>
                                ) : (
                                  <span className="text-xs text-gray-400">–</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {tb.commissionCents
                                  ? formatCurrency(tb.commissionCents, tb.currency || currency)
                                  : '–'}
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
