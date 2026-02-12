'use client'

/**
 * Notification Bell Component
 *
 * Bell icon with unread count badge that opens the notification panel.
 */

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NotificationPanel } from './notification-panel'
import { useUnreadCount } from '@/hooks/use-notifications'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: unreadCountData } = useUnreadCount()
  const unreadCount = unreadCountData?.count ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 flex items-center justify-center',
                'min-w-[18px] h-[18px] rounded-full',
                'bg-destructive text-destructive-foreground',
                'text-[10px] font-semibold px-1'
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-auto"
        align="end"
        sideOffset={8}
      >
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
