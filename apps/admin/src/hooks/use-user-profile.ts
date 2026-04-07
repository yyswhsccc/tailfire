/**
 * User Profile Hooks
 *
 * TanStack Query hooks for user profile management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  UserProfileResponseDto,
  UpdateUserProfileDto,
  AvatarUploadResponseDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const userProfileKeys = {
  all: ['userProfile'] as const,
  me: () => [...userProfileKeys.all, 'me'] as const,
  public: (id: string) => [...userProfileKeys.all, 'public', id] as const,
}

// Advisor profile query keys
export const advisorProfileKeys = {
  all: ['advisorProfile'] as const,
  me: () => [...advisorProfileKeys.all, 'me'] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch the advisor profile linked to the current authenticated user.
 * Returns null if no advisor profile exists for this user.
 */
export function useMyAdvisorProfile() {
  return useQuery({
    queryKey: advisorProfileKeys.me(),
    queryFn: () => api.get<{ id: string; slug: string; isPublished: boolean } | null>('/advisor-profiles/me'),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  })
}

/**
 * Fetch current user's full profile
 */
export function useMyProfile() {
  return useQuery({
    queryKey: userProfileKeys.me(),
    queryFn: () => api.get<UserProfileResponseDto>('/user-profiles/me'),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Update current user's profile
 */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateUserProfileDto) =>
      api.put<UserProfileResponseDto>('/user-profiles/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userProfileKeys.me() })
    },
  })
}

/**
 * Upload avatar image
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.postFormData<AvatarUploadResponseDto>(
        '/user-profiles/me/avatar',
        formData
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userProfileKeys.me() })
    },
  })
}

/**
 * Delete avatar image
 */
export function useDeleteAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete('/user-profiles/me/avatar'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userProfileKeys.me() })
    },
  })
}
