import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  UserListResponseDto,
  UserDetailDto,
  UserCreatedResponseDto,
  UserInviteResponseDto,
  CreateUserRequestDto,
  InviteUserRequestDto,
  UpdateUserRequestDto,
  UpdateUserStatusRequestDto,
  ListUsersParamsDto,
} from '@tailfire/shared-types'

// Query Keys
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (params: ListUsersParamsDto) => [...usersKeys.lists(), params] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated list of users with filters
 */
export function useUsers(params: ListUsersParamsDto = {}) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params.search) searchParams.set('search', params.search)
      if (params.status) searchParams.set('status', params.status)
      if (params.role) searchParams.set('role', params.role)
      if (params.includeDeleted) searchParams.set('includeDeleted', 'true')
      if (params.page) searchParams.set('page', String(params.page))
      if (params.limit) searchParams.set('limit', String(params.limit))

      const queryString = searchParams.toString()
      const url = queryString ? `/users?${queryString}` : '/users'
      return api.get<UserListResponseDto>(url)
    },
  })
}

/**
 * Fetch single user by ID
 */
export function useUser(id: string | null) {
  return useQuery({
    queryKey: usersKeys.detail(id || ''),
    queryFn: () => api.get<UserDetailDto>(`/users/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new user with full account
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateUserRequestDto) =>
      api.post<UserCreatedResponseDto>('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}

/**
 * Invite user via email
 */
export function useInviteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: InviteUserRequestDto) =>
      api.post<UserInviteResponseDto>('/users/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}

/**
 * Update user profile
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequestDto }) =>
      api.patch<UserDetailDto>(`/users/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(variables.id) })
    },
  })
}

/**
 * Update user status (lock/unlock/activate)
 */
export function useUpdateUserStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserStatusRequestDto }) =>
      api.patch<UserDetailDto>(`/users/${id}/status`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(variables.id) })
    },
  })
}

/**
 * Delete user (soft delete)
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}

/**
 * Resend invitation email
 */
export function useResendInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<UserInviteResponseDto>(`/users/${id}/resend-invite`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(id) })
    },
  })
}

/**
 * Reset MFA (unenroll all TOTP factors) for a user — admin only
 */
export function useResetUserMfa() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; factorsRemoved: number }>(`/users/${id}/reset-mfa`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}
