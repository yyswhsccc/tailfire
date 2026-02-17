/**
 * ContactActivityFeed Component
 *
 * Timeline component for displaying contact activity logs.
 * Shows both direct contact changes and related trip activity.
 * Reuses the same rendering pattern as the trip ActivityFeed.
 */

import { useState } from 'react'
import {
  Plus,
  Edit,
  Trash2,
  User,
  UserPlus,
  UserMinus,
  Calendar,
  XCircle,
  Eye,
  EyeOff,
  MapPin,
  Package,
  DollarSign,
  FileText,
  Image as ImageIcon,
  HelpCircle,
  FolderInput,
  FolderMinus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useContactActivity } from '@/hooks/use-contact-activity'
import type { ActivityLog } from '@/hooks/use-trip-activity'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ContactActivityFeedProps {
  contactId: string
  limit?: number
  showLoadMore?: boolean
}

/**
 * Get icon component for activity based on entity type and action
 */
function getActivityIcon(log: ActivityLog) {
  const iconClass = 'h-4 w-4'

  // Contact activity
  if (log.entityType === 'contact') {
    if (log.action === 'created') return <UserPlus className={iconClass} />
    if (log.action === 'updated') return <Edit className={iconClass} />
    if (log.action === 'deleted') return <Trash2 className={iconClass} />
    if (log.action === 'status_changed') return <User className={iconClass} />
  }

  // Trip activity
  if (log.entityType === 'trip') {
    if (log.action === 'created') return <Plus className={iconClass} />
    if (log.action === 'updated') return <Edit className={iconClass} />
    if (log.action === 'deleted') return <Trash2 className={iconClass} />
    if (log.action === 'published') return <Eye className={iconClass} />
    if (log.action === 'unpublished') return <EyeOff className={iconClass} />
    if (log.action === 'moved_to_group') return <FolderInput className={iconClass} />
    if (log.action === 'removed_from_group') return <FolderMinus className={iconClass} />
  }

  // Traveler activity
  if (log.entityType === 'trip_traveler') {
    if (log.action === 'created') return <UserPlus className={iconClass} />
    if (log.action === 'updated') return <User className={iconClass} />
    if (log.action === 'deleted') return <UserMinus className={iconClass} />
  }

  // Itinerary activity
  if (log.entityType === 'itinerary') {
    return <Calendar className={iconClass} />
  }

  // Trip Activity (tours, hotels, flights, etc.)
  if (log.entityType === 'activity') {
    return <MapPin className={iconClass} />
  }

  // Booking/Package activity
  if (log.entityType === 'booking') {
    return <Package className={iconClass} />
  }

  // Installment activity
  if (log.entityType === 'installment') {
    return <DollarSign className={iconClass} />
  }

  // Document activity
  if (log.entityType === 'activity_document' || log.entityType === 'booking_document') {
    return <FileText className={iconClass} />
  }

  // Media activity
  if (log.entityType === 'activity_media' || log.entityType === 'trip_media') {
    return <ImageIcon className={iconClass} />
  }

  // Default fallback
  if (log.action === 'created') return <Plus className={iconClass} />
  if (log.action === 'updated') return <Edit className={iconClass} />
  if (log.action === 'deleted') return <Trash2 className={iconClass} />
  return <HelpCircle className={iconClass} />
}

/**
 * Get background color for activity icon
 */
function getIconBgColor(log: ActivityLog): string {
  // Contact-specific colors
  if (log.entityType === 'contact') {
    if (log.action === 'created') return 'bg-green-100 text-green-600'
    if (log.action === 'deleted') return 'bg-red-100 text-red-600'
    if (log.action === 'status_changed') return 'bg-purple-100 text-purple-600'
    return 'bg-blue-100 text-blue-600'
  }

  // Entity-specific colors
  if (log.entityType === 'booking') {
    if (log.action === 'deleted') return 'bg-red-100 text-red-600'
    return 'bg-amber-100 text-amber-600'
  }

  if (log.entityType === 'installment') {
    if (log.action === 'deleted') return 'bg-red-100 text-red-600'
    return 'bg-emerald-100 text-emerald-600'
  }

  if (log.entityType === 'activity_document' || log.entityType === 'booking_document') {
    if (log.action === 'deleted') return 'bg-red-100 text-red-600'
    return 'bg-cyan-100 text-cyan-600'
  }

  if (log.entityType === 'activity_media' || log.entityType === 'trip_media') {
    if (log.action === 'deleted') return 'bg-red-100 text-red-600'
    return 'bg-violet-100 text-violet-600'
  }

  // Default action-based colors
  if (log.action === 'created') return 'bg-green-100 text-green-600'
  if (log.action === 'deleted') return 'bg-red-100 text-red-600'
  if (log.action === 'updated') return 'bg-blue-100 text-blue-600'
  if (log.action === 'status_changed') return 'bg-purple-100 text-purple-600'
  return 'bg-gray-100 text-gray-600'
}

/**
 * Format relative time for activity
 */
function formatActivityTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return 'Unknown time'
  }
}

/**
 * Single activity log item
 */
function ActivityItem({ log }: { log: ActivityLog }) {
  const iconBgColor = getIconBgColor(log)
  const icon = getActivityIcon(log)
  const timeAgo = formatActivityTime(log.createdAt)

  return (
    <div className="flex gap-3 py-3">
      {/* Icon */}
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${iconBgColor}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ash-900">{log.description}</p>
        <p className="text-xs text-ash-500 mt-1">{timeAgo}</p>
      </div>
    </div>
  )
}

/**
 * Loading skeleton for activity feed
 */
function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-3 py-3">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * ContactActivityFeed Component
 *
 * Main timeline component that fetches and displays contact activity logs
 */
export function ContactActivityFeed({
  contactId,
  limit = 10,
  showLoadMore = false,
}: ContactActivityFeedProps) {
  const [offset, setOffset] = useState(0)
  const { data: logs = [], isLoading, isError } = useContactActivity({
    contactId,
    limit,
    offset,
  })

  const handleLoadMore = () => {
    setOffset((prev) => prev + limit)
  }

  const handleLoadPrevious = () => {
    setOffset((prev) => Math.max(0, prev - limit))
  }

  if (isLoading) {
    return <ActivityFeedSkeleton />
  }

  if (isError) {
    return (
      <div className="text-center py-8">
        <XCircle className="h-12 w-12 text-red-300 mx-auto mb-3" />
        <p className="text-sm text-ash-900 mb-1">Failed to load activity</p>
        <p className="text-sm text-ash-500">Please try again later.</p>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar className="h-12 w-12 text-ash-300 mx-auto mb-3" />
        <p className="text-sm text-ash-900 mb-1">No activity yet</p>
        <p className="text-sm text-ash-500">Activity will appear here as changes are made.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Activity Timeline */}
      <div className="space-y-1 divide-y divide-ash-100">
        {logs.map((log) => (
          <ActivityItem key={log.id} log={log} />
        ))}
      </div>

      {/* Load More Controls */}
      {showLoadMore && (
        <div className="flex gap-2 justify-center mt-6">
          {offset > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadPrevious}
            >
              Previous
            </Button>
          )}
          {logs.length === limit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
            >
              Load More
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
