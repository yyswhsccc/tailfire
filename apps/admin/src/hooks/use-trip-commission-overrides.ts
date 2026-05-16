/**
 * use-trip-commission-overrides.ts (PR-2 Commit 2)
 *
 * Hooks for the Trip Settings tab:
 *  - useTripCollaborators(tripId)              — GET /trips/:id/collaborators
 *  - useUpdateCommissionOverrides()            — PATCH /trips/:id/commission-overrides
 *
 * Read returns trip_collaborators with joined user display fields and the
 * new per-trip agent_split_override. Write atomically updates fee + per-
 * collaborator overrides + writes trip_settings_history audit rows
 * (server-side in TripsService.updateCommissionOverrides — PR-1 commit 9).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  TripCollaboratorResponseDto,
  UpdateCommissionOverridesDto,
} from '@tailfire/shared-types/api'

export const tripCommissionOverrideKeys = {
  all: ['trip-commission-overrides'] as const,
  collaborators: (tripId: string) =>
    [...tripCommissionOverrideKeys.all, 'collaborators', tripId] as const,
}

export function useTripCollaborators(tripId: string | null) {
  return useQuery({
    queryKey: tripCommissionOverrideKeys.collaborators(tripId || ''),
    queryFn: () => api.get<TripCollaboratorResponseDto[]>(`/trips/${tripId}/collaborators`),
    enabled: !!tripId,
  })
}

export function useUpdateCommissionOverrides() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, body }: { tripId: string; body: UpdateCommissionOverridesDto }) =>
      api.patch<{ tripId: string; updatedCollaborators: number }>(
        `/trips/${tripId}/commission-overrides`,
        body,
      ),
    onSuccess: (_data, variables) => {
      // Re-fetch collaborators (overrides change agent_split_override) and
      // trip detail (fee_rate_override lives there).
      queryClient.invalidateQueries({
        queryKey: tripCommissionOverrideKeys.collaborators(variables.tripId),
      })
      queryClient.invalidateQueries({ queryKey: ['trips', 'detail', variables.tripId] })
    },
  })
}
