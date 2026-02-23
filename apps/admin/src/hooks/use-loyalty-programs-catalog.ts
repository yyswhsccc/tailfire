import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  LoyaltyProgramCatalogDto,
  LoyaltyProgramCatalogListResponse,
  CreateLoyaltyProgramCatalogDto,
  UpdateLoyaltyProgramCatalogDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const loyaltyProgramCatalogKeys = {
  all: ['loyalty-programs-catalog'] as const,
  lists: () => [...loyaltyProgramCatalogKeys.all, 'list'] as const,
  list: (filters?: Record<string, string | undefined>) =>
    [...loyaltyProgramCatalogKeys.lists(), filters] as const,
  details: () => [...loyaltyProgramCatalogKeys.all, 'detail'] as const,
  detail: (id: string) => [...loyaltyProgramCatalogKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

export function useLoyaltyProgramsCatalog(filters?: {
  type?: string
  search?: string
  active?: string
  page?: number
  limit?: number
}) {
  const params = new URLSearchParams()
  if (filters?.type) params.set('type', filters.type)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.active) params.set('active', filters.active)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))

  const queryString = params.toString()
  const endpoint = `/loyalty-programs${queryString ? `?${queryString}` : ''}`

  return useQuery({
    queryKey: loyaltyProgramCatalogKeys.list(filters as any),
    queryFn: () => api.get<LoyaltyProgramCatalogListResponse>(endpoint),
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useCreateLoyaltyProgramCatalog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateLoyaltyProgramCatalogDto) =>
      api.post<LoyaltyProgramCatalogDto>('/loyalty-programs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loyaltyProgramCatalogKeys.lists() })
    },
  })
}

export function useUpdateLoyaltyProgramCatalog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLoyaltyProgramCatalogDto }) =>
      api.patch<LoyaltyProgramCatalogDto>(`/loyalty-programs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loyaltyProgramCatalogKeys.lists() })
    },
  })
}

export function useDeleteLoyaltyProgramCatalog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/loyalty-programs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loyaltyProgramCatalogKeys.lists() })
    },
  })
}
