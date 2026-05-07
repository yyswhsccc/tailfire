'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface PortalMessage {
  id: string
  contactId: string
  tripId: string | null
  senderType: 'agent' | 'consumer'
  senderId: string | null
  senderName: string | null
  body: string
  readAt: string | null
  createdAt: string
}

export function usePortalMessages(tripId?: string) {
  const qs = tripId ? `?tripId=${tripId}` : ''
  return useQuery({
    queryKey: ['portal', 'messages', tripId],
    queryFn: () => portalApi<PortalMessage[]>(`/portal/my-messages${qs}`),
    refetchInterval: 15000, // Poll every 15 seconds for new messages
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { body: string; tripId?: string }) =>
      portalApi<PortalMessage>('/portal/my-messages', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'messages'] })
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['portal', 'messages', 'unread'],
    queryFn: () => portalApi<{ count: number }>('/portal/my-messages/unread'),
    refetchInterval: 30000, // Poll every 30 seconds
  })
}
