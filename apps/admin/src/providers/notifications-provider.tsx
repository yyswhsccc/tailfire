'use client'

/**
 * Notifications Provider
 *
 * Provides real-time notification updates via Supabase Realtime.
 * Subscribes to postgres_changes on platform_notifications table.
 */

import { createContext, useContext, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import { notificationKeys } from '@/hooks/use-notifications'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface NotificationsContextValue {
  /** Manually refresh notifications */
  refresh: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined)

interface NotificationsProviderProps {
  children: React.ReactNode
}

export function NotificationsProvider({ children }: NotificationsProviderProps) {
  const queryClient = useQueryClient()
  const { claims } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const userId = claims?.userId

  // Refresh function to invalidate notification queries
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  }, [queryClient])

  // Subscribe to Supabase Realtime for notifications
  useEffect(() => {
    if (!userId) return

    let channel: RealtimeChannel | null = null

    const setupSubscription = () => {
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'platform_notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
            queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })

            // If it's an update to a specific notification, invalidate its detail query
            if (payload.eventType === 'UPDATE' && payload.new?.id) {
              queryClient.invalidateQueries({
                queryKey: notificationKeys.detail(payload.new.id as string),
              })
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.debug('[Notifications] Realtime subscription active')
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[Notifications] Realtime subscription failed — falling back to polling. Ensure Realtime is enabled for platform_notifications in Supabase.')
          }
        })
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [userId, queryClient, supabase])

  const value = useMemo(() => ({ refresh }), [refresh])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

/**
 * Hook to access notifications context
 */
export function useNotificationsContext() {
  const context = useContext(NotificationsContext)
  if (context === undefined) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider')
  }
  return context
}
