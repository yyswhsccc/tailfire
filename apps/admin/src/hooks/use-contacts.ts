import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ContactResponseDto,
  ContactWithRelationshipsResponseDto,
  CreateContactDto,
  UpdateContactDto,
  ContactFilterDto,
  PaginatedContactsResponseDto,
  PortalInviteResponseDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (filters: ContactFilterDto) =>
    [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated list of contacts
 */
export function useContacts(filters: ContactFilterDto = {}) {
  return useQuery({
    queryKey: contactKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.search) params.append('search', filters.search)
      if (filters.tags?.length) {
        filters.tags.forEach((tag) => params.append('tags', tag))
      }
      if (filters.isActive !== undefined)
        params.append('isActive', filters.isActive.toString())
      if (filters.sortBy) params.append('sortBy', filters.sortBy)

      return api.get<PaginatedContactsResponseDto>(
        `/contacts?${params.toString()}`
      )
    },
  })
}

/**
 * Fetch single contact by ID
 */
export function useContact(id: string | null) {
  return useQuery({
    queryKey: contactKeys.detail(id || ''),
    queryFn: () => api.get<ContactResponseDto>(`/contacts/${id}`),
    enabled: !!id,
  })
}

/**
 * Fetch contact with relationships
 */
export function useContactWithRelationships(id: string | null) {
  return useQuery({
    queryKey: [...contactKeys.detail(id || ''), 'relationships'],
    queryFn: () =>
      api.get<ContactWithRelationshipsResponseDto>(
        `/contacts/${id}?includeRelationships=true`
      ),
    enabled: !!id,
  })
}

/**
 * Fetch trips associated with a contact
 */
export function useContactTrips(contactId: string | null) {
  return useQuery({
    queryKey: [...contactKeys.detail(contactId || ''), 'trips'],
    queryFn: () =>
      api.get<
        Array<{
          id: string
          name: string
          status: string
          tripType: string | null
          startDate: string | null
          endDate: string | null
          isPrimaryContact: boolean
          createdAt: string
        }>
      >(`/contacts/${contactId}/trips`),
    enabled: !!contactId,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new contact
 */
export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateContactDto) =>
      api.post<ContactResponseDto>('/contacts', data),
    onSuccess: () => {
      // Invalidate and refetch contacts list
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Update existing contact
 */
export function useUpdateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContactDto }) =>
      api.put<ContactResponseDto>(`/contacts/${id}`, data),
    onSuccess: (_, variables) => {
      // Invalidate specific contact and lists
      queryClient.invalidateQueries({
        queryKey: contactKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Delete contact
 */
export function useDeleteContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Promote lead to client
 */
export function usePromoteToClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<ContactResponseDto>(`/contacts/${id}/promote-to-client`, {}),
    onSuccess: (_, id) => {
      // Invalidate specific contact and lists
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Update contact status
 */
export function useUpdateContactStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<ContactResponseDto>(`/contacts/${id}/status`, { status }),
    onSuccess: (_, variables) => {
      // Invalidate specific contact and lists
      queryClient.invalidateQueries({
        queryKey: contactKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Send portal invite to a contact
 */
export function useSendPortalInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<PortalInviteResponseDto>(`/contacts/${id}/portal-invite`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Update marketing consent
 */
export function useUpdateMarketingConsent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: {
        email?: boolean
        sms?: boolean
        phone?: boolean
        source?: string
        optOutReason?: string
      }
    }) => api.patch<ContactResponseDto>(`/contacts/${id}/marketing-consent`, data),
    onSuccess: (_, variables) => {
      // Invalidate specific contact and lists
      queryClient.invalidateQueries({
        queryKey: contactKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}
