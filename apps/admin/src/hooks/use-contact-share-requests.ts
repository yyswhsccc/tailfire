import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const shareRequestKeys = {
  all: ['contactShareRequests'] as const,
  pending: () => [...shareRequestKeys.all, 'pending'] as const,
}

interface PendingShareRequest {
  id: string
  contactId: string
  requesterId: string
  requesterName: string
  contactName: string
  status: string
  createdAt: string
}

export function usePendingShareRequests() {
  return useQuery({
    queryKey: shareRequestKeys.pending(),
    queryFn: () => api.get<PendingShareRequest[]>('/contacts/share-requests/pending'),
    staleTime: 1000 * 60,
  })
}

export function useResolveShareRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, status, reason }: {
      requestId: string
      status: 'approved' | 'denied'
      reason?: string
    }) => api.patch(`/contacts/share-requests/${requestId}`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareRequestKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

export function useReassignContactOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, ownerId }: { contactId: string; ownerId: string }) =>
      api.patch(`/contacts/${contactId}/owner`, { ownerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareRequestKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
