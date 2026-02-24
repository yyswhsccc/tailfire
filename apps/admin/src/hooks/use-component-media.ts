import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { itineraryDayKeys } from './use-itinerary-days'

// Component entity types matching backend
export type ComponentEntityType =
  | 'activity'
  | 'accommodation'
  | 'flight'
  | 'transfer'
  | 'dining'
  | 'cruise'
  | 'port_info'
  | 'option'

// Media response DTO
export interface ComponentMediaDto {
  id: string
  componentId: string
  entityType: ComponentEntityType
  mediaType: 'image' | 'video' | 'document'
  fileUrl: string
  fileName: string
  fileSize: number | null
  caption: string | null
  orderIndex: number
  uploadedAt: string
  uploadedBy: string | null
  attribution: {
    source: 'unsplash'
    photoId: string
    photographerName: string
    photographerUsername: string
    photographerUrl: string
    sourceUrl: string
    downloadLocation: string
  } | null
}

// Query Keys
export const componentMediaKeys = {
  all: ['componentMedia'] as const,
  lists: () => [...componentMediaKeys.all, 'list'] as const,
  list: (componentId: string, entityType: ComponentEntityType) =>
    [...componentMediaKeys.lists(), componentId, entityType] as const,
  details: () => [...componentMediaKeys.all, 'detail'] as const,
  detail: (componentId: string, entityType: ComponentEntityType, id: string) =>
    [...componentMediaKeys.details(), componentId, entityType, id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch all media for a component
 */
export function useComponentMedia(componentId: string, entityType: ComponentEntityType) {
  return useQuery({
    queryKey: componentMediaKeys.list(componentId, entityType),
    queryFn: async () => {
      const response = await api.get<{ media: ComponentMediaDto[] }>(
        `/components/${componentId}/media?entityType=${entityType}`
      )
      return response.media
    },
    enabled: !!componentId,
  })
}

/**
 * Fetch single media item by ID
 */
export function useComponentMediaItem(
  componentId: string,
  entityType: ComponentEntityType,
  id: string | null
) {
  return useQuery({
    queryKey: componentMediaKeys.detail(componentId, entityType, id || ''),
    queryFn: () => api.get<ComponentMediaDto>(`/components/${componentId}/media/${id}`),
    enabled: !!componentId && !!id,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Upload new media file for a component
 * @param itineraryId - Optional itinerary ID to invalidate thumbnail cache
 */
export function useUploadComponentMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      caption,
    }: {
      file: File
      caption?: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (caption) formData.append('caption', caption)

      return api.postFormData<ComponentMediaDto>(
        `/components/${componentId}/media?entityType=${entityType}`,
        formData
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      // Invalidate itinerary day cache to update activity thumbnails
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}

/**
 * Add external media from Unsplash
 * @param itineraryId - Optional itinerary ID to invalidate thumbnail cache
 */
export function useAddExternalComponentMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      unsplashPhotoId: string
      downloadLocation: string
      caption?: string
    }) =>
      api.post<ComponentMediaDto>(
        `/components/${componentId}/media/external?entityType=${entityType}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      // Invalidate itinerary day cache to update activity thumbnails
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}

/**
 * Update media metadata (caption)
 */
export function useUpdateComponentMedia(componentId: string, entityType: ComponentEntityType) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { caption?: string } }) =>
      api.patch<ComponentMediaDto>(`/components/${componentId}/media/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.detail(componentId, entityType, variables.id),
      })
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
    },
  })
}

/**
 * Import external URL media (e.g. Amadeus tour images)
 * Uses POST /components/:id/media/external/url
 */
export function useImportExternalUrlMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      url: string
      caption?: string
      attribution?: {
        source: string
        sourceUrl?: string
        photographerName?: string
      }
    }) =>
      api.post<ComponentMediaDto>(
        `/components/${componentId}/media/external/url?entityType=${entityType}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}

/**
 * Delete media item
 * @param itineraryId - Optional itinerary ID to invalidate thumbnail cache
 */
export function useDeleteComponentMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean }>(`/components/${componentId}/media/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      // Invalidate itinerary day cache to update activity thumbnails
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}

/**
 * Set a media item as the primary image (thumbnail)
 * @param itineraryId - Optional itinerary ID to invalidate thumbnail cache
 */
export function useSetPrimaryComponentMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mediaId: string) =>
      api.post<ComponentMediaDto>(
        `/components/${componentId}/media/${mediaId}/set-primary?entityType=${entityType}`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}

/**
 * Batch delete multiple media items
 * @param itineraryId - Optional itinerary ID to invalidate thumbnail cache
 */
export function useDeleteBatchComponentMedia(
  componentId: string,
  entityType: ComponentEntityType,
  itineraryId?: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ success: boolean; deletedCount: number }>(
        `/components/${componentId}/media/batch-delete?entityType=${entityType}`,
        { ids }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: componentMediaKeys.list(componentId, entityType),
      })
      if (itineraryId) {
        void queryClient.invalidateQueries({
          queryKey: itineraryDayKeys.withActivities(itineraryId),
        })
      }
    },
  })
}
