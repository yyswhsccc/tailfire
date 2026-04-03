import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { contactKeys } from './use-contacts'
import type {
  ContactMergeRequest,
  ContactMergeResult,
  DuplicateDetectionResult,
  DuplicateDismissRequest,
} from '@tailfire/shared-types/api'

export function useContactMerge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ContactMergeRequest) =>
      api.post<ContactMergeResult>('/contacts/merge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all })
    },
  })
}

export function useDuplicateDetection() {
  return useQuery({
    queryKey: [...contactKeys.all, 'duplicates'],
    queryFn: () => api.get<DuplicateDetectionResult>('/contacts/duplicates'),
    staleTime: 5 * 60 * 1000, // 5 min cache
    enabled: false, // Only fetch on-demand (refetch() call)
  })
}

export function useDismissDuplicate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DuplicateDismissRequest) =>
      api.post('/contacts/duplicates/dismiss', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...contactKeys.all, 'duplicates'] })
    },
  })
}
