import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  NoteResponseDto,
  PaginatedNotesResponseDto,
  CreateNoteDto,
  UpdateNoteDto,
  NoteFilterDto,
} from '@tailfire/shared-types/api'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (filters: NoteFilterDto) => [...noteKeys.lists(), filters] as const,
  details: () => [...noteKeys.all, 'detail'] as const,
  detail: (id: string) => [...noteKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated list of notes
 */
export function useNotes(filters: NoteFilterDto = {}) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()

      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.search) params.append('search', filters.search)
      if (filters.tripId) params.append('tripId', filters.tripId)
      if (filters.contactId) params.append('contactId', filters.contactId)
      if (filters.tripGroupId) params.append('tripGroupId', filters.tripGroupId)

      return api.get<PaginatedNotesResponseDto>(`/notes?${params.toString()}`)
    },
    enabled: !!(filters.tripId || filters.contactId || filters.tripGroupId),
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new note (with optimistic insert)
 */
export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateNoteDto & { _optimistic?: OptimisticUserInfo }) => {
      const { _optimistic, ...payload } = data
      return api.post<NoteResponseDto>('/notes', payload)
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedNotesResponseDto>({
          queryKey: noteKeys.lists(),
        })

      if (data._optimistic) {
        const tempId = `temp-${Date.now()}`
        const now = new Date().toISOString()
        const optimisticNote: NoteResponseDto = {
          id: tempId,
          agencyId: '',
          content: data.content,
          tripId: data.tripId,
          contactId: data.contactId,
          tripGroupId: data.tripGroupId,
          isPinned: data.isPinned ?? false,
          createdBy: data._optimistic.userId,
          createdByUser: {
            id: data._optimistic.userId,
            firstName: data._optimistic.firstName,
            lastName: data._optimistic.lastName,
            avatarUrl: data._optimistic.avatarUrl,
          },
          createdAt: now,
          updatedAt: now,
        }

        for (const [queryKey, cached] of previousLists) {
          if (!cached) continue
          queryClient.setQueryData<PaginatedNotesResponseDto>(queryKey, {
            ...cached,
            data: [optimisticNote, ...cached.data],
            count: cached.count + 1,
          })
        }
      }

      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

interface OptimisticUserInfo {
  userId: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

/**
 * Update an existing note (with optimistic update)
 */
export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteDto }) =>
      api.put<NoteResponseDto>(`/notes/${id}`, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedNotesResponseDto>({
          queryKey: noteKeys.lists(),
        })

      for (const [queryKey, cached] of previousLists) {
        if (!cached) continue
        queryClient.setQueryData<PaginatedNotesResponseDto>(queryKey, {
          ...cached,
          data: cached.data.map((note) =>
            note.id === id
              ? { ...note, ...data, updatedAt: new Date().toISOString() }
              : note
          ),
        })
      }

      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

/**
 * Delete a note (with optimistic removal)
 */
export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedNotesResponseDto>({
          queryKey: noteKeys.lists(),
        })

      for (const [queryKey, cached] of previousLists) {
        if (!cached) continue
        queryClient.setQueryData<PaginatedNotesResponseDto>(queryKey, {
          ...cached,
          data: cached.data.filter((note) => note.id !== id),
          count: cached.count - 1,
        })
      }

      return { previousLists }
    },
    onError: (_err, _id, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}

/**
 * Toggle pin on a note (with optimistic update)
 */
export function useToggleNotePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      api.patch<NoteResponseDto>(`/notes/${id}/pin`, { isPinned }),
    onMutate: async ({ id, isPinned }) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedNotesResponseDto>({
          queryKey: noteKeys.lists(),
        })

      for (const [queryKey, cached] of previousLists) {
        if (!cached) continue
        queryClient.setQueryData<PaginatedNotesResponseDto>(queryKey, {
          ...cached,
          data: cached.data.map((note) =>
            note.id === id ? { ...note, isPinned } : note
          ),
        })
      }

      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
    },
  })
}
