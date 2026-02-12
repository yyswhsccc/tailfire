'use client'

/**
 * Notification Preferences Hook
 *
 * React Query hooks for managing user notification preferences.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  PushTokenInfo,
} from '@tailfire/shared-types/api'

/**
 * Query keys for notification preferences
 */
export const notificationPreferencesKeys = {
  all: ['notification-preferences'] as const,
  preferences: () => [...notificationPreferencesKeys.all, 'preferences'] as const,
  pushTokens: () => [...notificationPreferencesKeys.all, 'push-tokens'] as const,
}

/**
 * Fetch user's notification preferences
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationPreferencesKeys.preferences(),
    queryFn: () => api.get<NotificationPreferences>('/users/me/notification-preferences'),
  })
}

/**
 * Update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateNotificationPreferencesRequest) =>
      api.patch<NotificationPreferences>('/users/me/notification-preferences', data),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationPreferencesKeys.preferences(), data)
    },
  })
}

/**
 * Fetch registered push tokens
 */
export function usePushTokens() {
  return useQuery({
    queryKey: notificationPreferencesKeys.pushTokens(),
    queryFn: () => api.get<PushTokenInfo[]>('/users/me/notification-preferences/push-tokens'),
  })
}

/**
 * Remove a push token
 */
export function useRemovePushToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (token: string) =>
      api.delete<{ success: boolean; tokenCount: number }>(
        `/users/me/notification-preferences/push-tokens/${encodeURIComponent(token)}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationPreferencesKeys.pushTokens() })
      queryClient.invalidateQueries({ queryKey: notificationPreferencesKeys.preferences() })
    },
  })
}
