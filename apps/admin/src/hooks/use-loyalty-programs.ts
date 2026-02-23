import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LoyaltyProgramDto } from '@tailfire/shared-types/api'

// Query Keys
export const loyaltyProgramKeys = {
  all: ['loyalty-programs'] as const,
  lists: () => [...loyaltyProgramKeys.all, 'list'] as const,
  list: (contactId: string) => [...loyaltyProgramKeys.lists(), contactId] as const,
  details: () => [...loyaltyProgramKeys.all, 'detail'] as const,
  detail: (id: string) => [...loyaltyProgramKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch all loyalty programs for a specific contact
 */
export function useLoyaltyPrograms(contactId: string | null) {
  return useQuery({
    queryKey: loyaltyProgramKeys.list(contactId || ''),
    queryFn: async () => {
      return api.get<LoyaltyProgramDto[]>(`/contacts/${contactId}/loyalty-programs`)
    },
    enabled: !!contactId,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

interface CreateLoyaltyProgramData {
  programName: string
  providerName: string
  membershipNumber: string
  tierLevel?: string
  notes?: string
  loyaltyProgramId?: string
}

interface UpdateLoyaltyProgramData {
  programName?: string
  providerName?: string
  membershipNumber?: string
  tierLevel?: string
  notes?: string
  loyaltyProgramId?: string
}

/**
 * Create a new loyalty program
 */
export function useCreateLoyaltyProgram() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      contactId,
      data,
    }: {
      contactId: string
      data: CreateLoyaltyProgramData
    }) =>
      api.post<LoyaltyProgramDto>(
        `/contacts/${contactId}/loyalty-programs`,
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.list(variables.contactId),
      })
    },
  })
}

/**
 * Update an existing loyalty program
 */
export function useUpdateLoyaltyProgram() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      contactId,
      programId,
      data,
    }: {
      contactId: string
      programId: string
      data: UpdateLoyaltyProgramData
    }) =>
      api.patch<LoyaltyProgramDto>(
        `/contacts/${contactId}/loyalty-programs/${programId}`,
        data,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.list(variables.contactId),
      })
      queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.detail(variables.programId),
      })
    },
  })
}

/**
 * Delete a loyalty program
 */
export function useDeleteLoyaltyProgram() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      contactId,
      programId,
    }: {
      contactId: string
      programId: string
    }) =>
      api.delete(`/contacts/${contactId}/loyalty-programs/${programId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.list(variables.contactId),
      })
    },
  })
}
