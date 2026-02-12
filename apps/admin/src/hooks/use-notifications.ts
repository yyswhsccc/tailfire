/**
 * Notifications Hooks
 *
 * React Query hooks for platform notifications.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  PlatformNotification,
  NotificationsListResponse,
  UnreadCountResponse,
  NotificationActionResponse,
  GetNotificationsParams,
} from '@tailfire/shared-types/api'

// Query Keys
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters?: GetNotificationsParams) => [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  detail: (id: string) => [...notificationKeys.all, 'detail', id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch notifications with infinite scroll pagination
 */
export function useNotifications(filters?: Omit<GetNotificationsParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (filters?.limit) params.append('limit', filters.limit.toString())
      if (filters?.includeRead !== undefined) params.append('includeRead', filters.includeRead.toString())
      if (filters?.includeDismissed !== undefined) params.append('includeDismissed', filters.includeDismissed.toString())
      if (filters?.category) params.append('category', filters.category)
      if (pageParam) params.append('cursor', pageParam)

      const queryString = params.toString()
      return api.get<NotificationsListResponse>(`/notifications${queryString ? `?${queryString}` : ''}`)
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/**
 * Fetch unread notification count
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => api.get<UnreadCountResponse>('/notifications/unread-count'),
    refetchInterval: 60000, // Fallback polling every 60s
    staleTime: 30000, // Consider stale after 30s
  })
}

/**
 * Fetch a single notification
 */
export function useNotification(id: string | null) {
  return useQuery({
    queryKey: notificationKeys.detail(id || ''),
    queryFn: () => api.get<PlatformNotification>(`/notifications/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Mark a notification as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.patch<NotificationActionResponse>(`/notifications/${id}/read`),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      // Snapshot previous values
      const previousUnreadCount = queryClient.getQueryData<UnreadCountResponse>(notificationKeys.unreadCount())

      // Optimistically update unread count
      if (previousUnreadCount) {
        queryClient.setQueryData<UnreadCountResponse>(notificationKeys.unreadCount(), {
          count: Math.max(0, previousUnreadCount.count - 1),
        })
      }

      return { previousUnreadCount }
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousUnreadCount) {
        queryClient.setQueryData(notificationKeys.unreadCount(), context.previousUnreadCount)
      }
    },
    onSettled: () => {
      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    },
  })
}

/**
 * Dismiss a notification
 */
export function useDismissNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.patch<NotificationActionResponse>(`/notifications/${id}/dismiss`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      const previousUnreadCount = queryClient.getQueryData<UnreadCountResponse>(notificationKeys.unreadCount())

      // Optimistically update unread count (only if notification was unread)
      if (previousUnreadCount) {
        queryClient.setQueryData<UnreadCountResponse>(notificationKeys.unreadCount(), {
          count: Math.max(0, previousUnreadCount.count - 1),
        })
      }

      return { previousUnreadCount }
    },
    onError: (_err, _id, context) => {
      if (context?.previousUnreadCount) {
        queryClient.setQueryData(notificationKeys.unreadCount(), context.previousUnreadCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    },
  })
}

/**
 * Mark all notifications as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<NotificationActionResponse>('/notifications/mark-all-read'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      const previousUnreadCount = queryClient.getQueryData<UnreadCountResponse>(notificationKeys.unreadCount())

      // Optimistically set count to 0
      queryClient.setQueryData<UnreadCountResponse>(notificationKeys.unreadCount(), { count: 0 })

      return { previousUnreadCount }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousUnreadCount) {
        queryClient.setQueryData(notificationKeys.unreadCount(), context.previousUnreadCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    },
  })
}

/**
 * Mark multiple notifications as read
 */
export function useMarkMultipleAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationIds: string[]) =>
      api.post<NotificationActionResponse>('/notifications/mark-multiple-read', { notificationIds }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    },
  })
}
