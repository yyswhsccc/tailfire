import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ActivityResponseDto,
  CreateActivityDto,
  UpdateActivityDto,
  ReorderActivitiesDto,
  MoveActivityDto,
  ActivityFilterDto,
} from '@tailfire/shared-types/api'
import { itineraryDayKeys } from './use-itinerary-days'
import { bookingKeys } from './use-bookings'
import { useToast } from './use-toast'

// Query Keys
export const activityKeys = {
  all: ['activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (filters: ActivityFilterDto) => [...activityKeys.lists(), filters] as const,
  byDay: (dayId: string) => [...activityKeys.all, 'day', dayId] as const,
  details: () => [...activityKeys.all, 'detail'] as const,
  detail: (dayId: string, id: string) => [...activityKeys.details(), dayId, id] as const,
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Helper for dual-cache operations when moving activities between days
 */
interface DualDayCacheSnapshot {
  sourceDayId: string
  targetDayId: string
  previousSourceActivities?: ActivityResponseDto[]
  previousTargetActivities?: ActivityResponseDto[]
}

function snapshotDualDayCache(
  queryClient: ReturnType<typeof useQueryClient>,
  sourceDayId: string,
  targetDayId: string
): DualDayCacheSnapshot {
  return {
    sourceDayId,
    targetDayId,
    previousSourceActivities: queryClient.getQueryData<ActivityResponseDto[]>(
      activityKeys.byDay(sourceDayId)
    ),
    previousTargetActivities: queryClient.getQueryData<ActivityResponseDto[]>(
      activityKeys.byDay(targetDayId)
    ),
  }
}

function rollbackDualDayCache(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: DualDayCacheSnapshot
) {
  if (snapshot.previousSourceActivities) {
    queryClient.setQueryData(
      activityKeys.byDay(snapshot.sourceDayId),
      snapshot.previousSourceActivities
    )
  }
  if (snapshot.previousTargetActivities) {
    queryClient.setQueryData(
      activityKeys.byDay(snapshot.targetDayId),
      snapshot.previousTargetActivities
    )
  }
}

// ============================================================================
// GLOBAL QUERIES
// ============================================================================

/**
 * Fetch all activities with optional filtering
 * Uses global /activities endpoint
 */
export function useActivities(filters: ActivityFilterDto = {}) {
  return useQuery({
    queryKey: activityKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.itineraryDayId) params.append('itineraryDayId', filters.itineraryDayId)
      if (filters.activityType) params.append('activityType', filters.activityType)
      if (filters.status) params.append('status', filters.status)
      if (filters.sortBy) params.append('sortBy', filters.sortBy)
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.offset) params.append('offset', filters.offset.toString())

      const query = params.toString()
      return api.get<ActivityResponseDto[]>(`/activities${query ? `?${query}` : ''}`)
    },
  })
}

// ============================================================================
// DAY-SPECIFIC QUERIES
// ============================================================================

/**
 * Fetch all activities for a specific day
 * Uses nested /days/:dayId/activities endpoint
 */
export function useActivitiesByDay(dayId: string | null) {
  return useQuery({
    queryKey: activityKeys.byDay(dayId || ''),
    queryFn: () => api.get<ActivityResponseDto[]>(`/days/${dayId}/activities`),
    enabled: !!dayId,
  })
}

/**
 * Fetch single activity by ID
 */
export function useActivity(dayId: string | null, id: string | null) {
  return useQuery({
    queryKey: activityKeys.detail(dayId || '', id || ''),
    queryFn: () => api.get<ActivityResponseDto>(`/days/${dayId}/activities/${id}`),
    enabled: !!dayId && !!id,
    placeholderData: keepPreviousData,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new activity with optimistic updates and error handling
 */
export function useCreateActivity(itineraryId: string, dayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: Omit<CreateActivityDto, 'itineraryDayId'>) =>
      api.post<ActivityResponseDto>(`/days/${dayId}/activities`, data),
    onMutate: async (newActivity) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: activityKeys.byDay(dayId) })

      // Snapshot previous value
      const previousActivities = queryClient.getQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId)
      )

      // Optimistically add new activity to cache
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId),
        (old = []) => {
          const optimisticActivity: ActivityResponseDto = {
            id: `temp-${Date.now()}`,
            itineraryDayId: dayId,
            parentActivityId: newActivity.parentActivityId ?? null,
            componentType: newActivity.activityType,
            activityType: newActivity.activityType,
            name: newActivity.name,
            description: newActivity.description || null,
            location: newActivity.location || null,
            address: newActivity.address || null,
            coordinates: newActivity.coordinates || null,
            confirmationNumber: newActivity.confirmationNumber || null,
            proposalStatus: newActivity.proposalStatus || 'draft',
            bookingStatus: 'unbooked',
            isVisibleInCalendar: true,
            bookingDate: null,
            packageId: null,
            pricingType: newActivity.pricingType || 'per_person',
            currency: newActivity.currency || 'USD',
            pricing: null, // Will be populated by server response
            notes: newActivity.notes || null,
            startDatetime: newActivity.startDatetime || null,
            endDatetime: newActivity.endDatetime || null,
            timezone: newActivity.timezone || null,
            photos: newActivity.photos || null,
            thumbnail: null, // Will be populated from activity_media by server
            sequenceOrder: old.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          return [...old, optimisticActivity]
        }
      )

      return { previousActivities }
    },
    onSuccess: (newActivity) => {
      // Replace temp activity with server response to avoid flicker
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId),
        (old = []) => {
          // Replace the temp ID with the real one from server
          return old.map((activity) =>
            activity.id.startsWith('temp-') ? newActivity : activity
          )
        }
      )

      // Only invalidate exact keys that need refreshing
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(dayId), exact: true })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
    },
    onError: (_error, _variables, context) => {
      // Rollback to previous state
      if (context?.previousActivities) {
        queryClient.setQueryData(activityKeys.byDay(dayId), context.previousActivities)
      }
      toast({
        title: 'Error',
        description: 'Failed to create activity. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Update existing activity
 */
export function useUpdateActivity(itineraryId: string, dayId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateActivityDto }) =>
      api.patch<ActivityResponseDto>(`/days/${dayId}/activities/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: activityKeys.detail(dayId, variables.id),
      })
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(dayId) })
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
    },
  })
}

/**
 * Patch an activity when dayId varies per call (e.g., table view toggles)
 */
export function usePatchActivity(itineraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ activityId, dayId, data }: { activityId: string; dayId: string; data: UpdateActivityDto }) =>
      api.patch<ActivityResponseDto>(`/days/${dayId}/activities/${activityId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: activityKeys.detail(variables.dayId, variables.activityId),
      })
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(variables.dayId) })
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
    },
  })
}

/**
 * Delete activity with optimistic updates
 */
export function useDeleteActivity(itineraryId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ activityId, dayId }: { activityId: string; dayId: string }) =>
      api.delete(`/days/${dayId}/activities/${activityId}`),
    onMutate: async ({ activityId, dayId }) => {
      // Cancel outgoing refetches to prevent race conditions
      // Include detail query to prevent in-flight refetch rehydrating deleted activity
      await queryClient.cancelQueries({ queryKey: activityKeys.byDay(dayId) })
      await queryClient.cancelQueries({ queryKey: activityKeys.detail(dayId, activityId) })
      await queryClient.cancelQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })

      // Snapshot previous values for rollback
      const previousActivitiesByDay = queryClient.getQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId)
      )
      const previousDaysWithActivities = queryClient.getQueryData<
        { id: string; activities?: ActivityResponseDto[] }[]
      >(itineraryDayKeys.withActivities(itineraryId))

      // Optimistically remove from activities-by-day cache
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId),
        (old = []) => old.filter((a) => a.id !== activityId)
      )

      // Optimistically remove from days-with-activities cache
      // Spread day to preserve all other fields (date, name, etc.)
      queryClient.setQueryData<{ id: string; activities?: ActivityResponseDto[] }[]>(
        itineraryDayKeys.withActivities(itineraryId),
        (old = []) =>
          old.map((day) => ({
            ...day,
            activities: day.activities?.filter((a) => a.id !== activityId) || [],
          }))
      )

      // Remove the detail cache entry for the deleted activity
      queryClient.removeQueries({ queryKey: activityKeys.detail(dayId, activityId) })

      return { previousActivitiesByDay, previousDaysWithActivities, dayId, activityId }
    },
    onSuccess: (_, variables) => {
      // Refetch to ensure server state is in sync
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(variables.dayId) })
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      // Ensure detail cache is removed (belt-and-suspenders)
      queryClient.removeQueries({
        queryKey: activityKeys.detail(variables.dayId, variables.activityId),
      })
      // Invalidate bookings cache (deleted activity may appear in bookings/packages tab)
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
    onError: (_error, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousActivitiesByDay) {
        queryClient.setQueryData(
          activityKeys.byDay(context.dayId),
          context.previousActivitiesByDay
        )
      }
      if (context?.previousDaysWithActivities) {
        queryClient.setQueryData(
          itineraryDayKeys.withActivities(itineraryId),
          context.previousDaysWithActivities
        )
      }
      toast({
        title: 'Error',
        description: 'Failed to delete activity. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Reorder activities within a day (drag-and-drop) with optimistic updates
 */
export function useReorderActivities(dayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: ReorderActivitiesDto) =>
      api.post<ActivityResponseDto[]>(`/days/${dayId}/activities/reorder`, data),
    onMutate: async (reorderData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: activityKeys.byDay(dayId) })

      // Snapshot previous value
      const previousActivities = queryClient.getQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId)
      )

      // Optimistically update cache with new order
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(dayId),
        (old = []) => {
          // Create a map of activity ID to new sequence order
          const orderMap = new Map(
            reorderData.activityOrders.map((order) => [order.id, order.sequenceOrder])
          )

          // Update sequence orders and sort
          return old
            .map((activity) => ({
              ...activity,
              sequenceOrder: orderMap.get(activity.id) ?? activity.sequenceOrder,
            }))
            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        }
      )

      return { previousActivities }
    },
    onSuccess: () => {
      // Only invalidate the exact day query - no need to refetch global lists
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(dayId), exact: true })
    },
    onError: (_error, _variables, context) => {
      // Rollback to previous state
      if (context?.previousActivities) {
        queryClient.setQueryData(activityKeys.byDay(dayId), context.previousActivities)
      }
      toast({
        title: 'Error',
        description: 'Failed to reorder activities. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Move activity to a different day with optimistic updates
 */
export function useMoveActivity(currentDayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MoveActivityDto }) =>
      api.post<ActivityResponseDto>(`/days/${currentDayId}/activities/${id}/move`, data),
    onMutate: async ({ id, data }) => {
      const targetDayId = data.targetDayId

      // Cancel outgoing refetches for both days
      await queryClient.cancelQueries({ queryKey: activityKeys.byDay(currentDayId) })
      await queryClient.cancelQueries({ queryKey: activityKeys.byDay(targetDayId) })

      // Snapshot both days using helper
      const snapshot = snapshotDualDayCache(queryClient, currentDayId, targetDayId)

      // Find the activity being moved
      const activityToMove = snapshot.previousSourceActivities?.find((a) => a.id === id)
      if (!activityToMove) {
        return snapshot
      }

      // Remove from source day
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(currentDayId),
        (old = []) => old.filter((a) => a.id !== id)
      )

      // Add to target day
      queryClient.setQueryData<ActivityResponseDto[]>(
        activityKeys.byDay(targetDayId),
        (old = []) => {
          const movedActivity: ActivityResponseDto = {
            ...activityToMove,
            itineraryDayId: targetDayId,
            sequenceOrder: data.sequenceOrder ?? old.length,
          }
          return [...old, movedActivity].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        }
      )

      return snapshot
    },
    onSuccess: (_, variables) => {
      // Only invalidate exact keys for both days
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(currentDayId), exact: true })
      queryClient.invalidateQueries({
        queryKey: activityKeys.byDay(variables.data.targetDayId),
        exact: true,
      })
      // Invalidate day lists to refresh day columns with updated activity counts
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.lists() })
    },
    onError: (_error, _variables, context) => {
      // Rollback both days using helper
      if (context) {
        rollbackDualDayCache(queryClient, context)
      }
      toast({
        title: 'Error',
        description: 'Failed to move activity. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Duplicate an activity within the same day
 * Creates a copy with " (Copy)" appended to the name
 */
export function useDuplicateActivity(itineraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ activityId, dayId }: { activityId: string; dayId: string }) =>
      api.post<ActivityResponseDto>(`/days/${dayId}/activities/${activityId}/duplicate`),
    onSuccess: (_, variables) => {
      // Invalidate all relevant caches
      queryClient.invalidateQueries({ queryKey: activityKeys.byDay(variables.dayId) })
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
    },
  })
}
