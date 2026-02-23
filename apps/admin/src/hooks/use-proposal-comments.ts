/**
 * Admin Proposal Comments Hook
 *
 * React Query hook for fetching and posting comments on activities.
 * Subscribes to Supabase Realtime on proposal_comments for live updates.
 */

import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import type { ProposalCommentDto, ProposalCommentsResponseDto } from '@tailfire/shared-types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const proposalCommentKeys = {
  all: ['proposal-comments'] as const,
  list: (tripId: string, itineraryId: string) =>
    [...proposalCommentKeys.all, tripId, itineraryId] as const,
  activity: (tripId: string, itineraryId: string, activityId: string) =>
    [...proposalCommentKeys.all, tripId, itineraryId, activityId] as const,
}

/**
 * Fetch comments for a trip's itinerary (admin endpoint)
 */
export function useProposalComments(tripId: string, itineraryId: string, activityId?: string) {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])

  const queryKey = activityId
    ? proposalCommentKeys.activity(tripId, itineraryId, activityId)
    : proposalCommentKeys.list(tripId, itineraryId)

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (activityId) params.append('activityId', activityId)
      const qs = params.toString()
      return api.get<ProposalCommentsResponseDto>(
        `/trips/${tripId}/itineraries/${itineraryId}/comments${qs ? `?${qs}` : ''}`,
      )
    },
    enabled: !!tripId && !!itineraryId,
    staleTime: 30000,
  })

  // Subscribe to Realtime for new comments
  useEffect(() => {
    if (!tripId || !itineraryId) return

    let channel: RealtimeChannel | null = null

    channel = supabase
      .channel(`proposal-comments:${itineraryId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proposal_comments',
          filter: `itinerary_id=eq.${itineraryId}`,
        },
        () => {
          // Invalidate to refetch
          queryClient.invalidateQueries({ queryKey: proposalCommentKeys.list(tripId, itineraryId) })
        },
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [tripId, itineraryId, queryClient, supabase])

  return query
}

/**
 * Post an agent comment on a trip's itinerary
 */
export function usePostAgentComment(tripId: string, itineraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { activityId?: string; dayId?: string; content: string }) => {
      return api.post<ProposalCommentDto>(
        `/trips/${tripId}/itineraries/${itineraryId}/comments`,
        data,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: proposalCommentKeys.list(tripId, itineraryId),
      })
    },
  })
}
