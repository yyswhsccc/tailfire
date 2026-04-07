'use client'

/**
 * Notification Item Component
 *
 * Displays a single notification with title, body, timestamp, and actions.
 */

import { formatDistanceToNow } from 'date-fns'
import { X, Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PlatformNotification } from '@tailfire/shared-types/api'

interface NotificationItemProps {
  notification: PlatformNotification
  onMarkAsRead?: (id: string) => void
  onDismiss?: (id: string) => void
  onClick?: (notification: PlatformNotification) => void
}

/**
 * Get category icon/color based on notification category
 */
function getCategoryStyle(category: string): { bgColor: string; textColor: string } {
  switch (category) {
    case 'payment_reminders':
    case 'payment_alert':
      return { bgColor: 'bg-green-100', textColor: 'text-green-700' }
    case 'trip_updates':
    case 'booking_alerts':
      return { bgColor: 'bg-blue-100', textColor: 'text-blue-700' }
    case 'contact_share':
      return { bgColor: 'bg-blue-100', textColor: 'text-blue-700' }
    case 'assignment':
    case 'collaboration':
      return { bgColor: 'bg-purple-100', textColor: 'text-purple-700' }
    case 'client_care':
      return { bgColor: 'bg-orange-100', textColor: 'text-orange-700' }
    case 'system_alerts':
      return { bgColor: 'bg-gray-100', textColor: 'text-gray-700' }
    default:
      return { bgColor: 'bg-gray-100', textColor: 'text-gray-700' }
  }
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
  onClick,
}: NotificationItemProps) {
  const isUnread = notification.status === 'unread'
  const categoryStyle = getCategoryStyle(notification.category)
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

  const handleClick = () => {
    if (onClick) {
      onClick(notification)
    }
    // Mark as read when clicked
    if (isUnread && onMarkAsRead) {
      onMarkAsRead(notification.id)
    }
  }

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onMarkAsRead) {
      onMarkAsRead(notification.id)
    }
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDismiss) {
      onDismiss(notification.id)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-3 transition-colors cursor-pointer hover:bg-accent/50',
        isUnread && 'bg-accent/30'
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium truncate', isUnread && 'font-semibold')}>
              {notification.title}
            </p>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
              {notification.body}
            </p>
          </div>

          {/* Action buttons (visible on hover) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isUnread && onMarkAsRead && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleMarkAsRead}
                title="Mark as read"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleDismiss}
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Footer: timestamp and category */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              categoryStyle.bgColor,
              categoryStyle.textColor
            )}
          >
            {notification.category.replace(/_/g, ' ')}
          </span>
          {notification.actionUrl && (
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  )
}
