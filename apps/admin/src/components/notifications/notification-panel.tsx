'use client'

/**
 * Notification Panel Component
 *
 * Scrollable panel showing list of notifications with infinite scroll.
 */

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Loader2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { NotificationItem } from './notification-item'
import {
  useNotifications,
  useMarkAsRead,
  useDismissNotification,
  useMarkAllAsRead,
  useUnreadCount,
} from '@/hooks/use-notifications'
import type { PlatformNotification } from '@tailfire/shared-types/api'

interface NotificationPanelProps {
  onClose?: () => void
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Queries
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useNotifications({ limit: 20, includeRead: true, includeDismissed: false })

  const { data: unreadCountData } = useUnreadCount()

  // Mutations
  const markAsRead = useMarkAsRead()
  const dismiss = useDismissNotification()
  const markAllAsRead = useMarkAllAsRead()

  // Flatten pages into notifications array
  const notifications = data?.pages.flatMap((page) => page.notifications) ?? []
  const unreadCount = unreadCountData?.count ?? 0

  // Handle notification click - navigate if action URL exists
  const handleNotificationClick = useCallback(
    (notification: PlatformNotification) => {
      if (notification.actionUrl) {
        router.push(notification.actionUrl)
        onClose?.()
      }
    },
    [router, onClose]
  )

  // Handle mark as read
  const handleMarkAsRead = useCallback(
    (id: string) => {
      markAsRead.mutate(id)
    },
    [markAsRead]
  )

  // Handle dismiss
  const handleDismiss = useCallback(
    (id: string) => {
      dismiss.mutate(id)
    },
    [dismiss]
  )

  // Handle mark all as read
  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead.mutate()
  }, [markAllAsRead])

  // Handle scroll to load more
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement
      const { scrollTop, scrollHeight, clientHeight } = target

      // Load more when near bottom (within 100px)
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  return (
    <div className="flex flex-col w-[380px] max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({unreadCount} unread)
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleMarkAllAsRead}
            disabled={markAllAsRead.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScrollCapture={handleScroll}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-2" />
            <p className="text-sm">No notifications</p>
            <p className="text-xs">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDismiss={handleDismiss}
                onClick={handleNotificationClick}
              />
            ))}

            {/* Loading more indicator */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* End of list */}
            {!hasNextPage && notifications.length > 0 && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                No more notifications
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer - link to settings */}
      <Separator />
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            router.push('/profile?tab=notifications')
            onClose?.()
          }}
        >
          Notification Settings
        </Button>
      </div>
    </div>
  )
}
