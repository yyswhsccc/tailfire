"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getApiClient } from "@/lib/api-client"

interface FeedbackSubmission {
  message?: string
  activityNotes?: { activityId: string; activityName: string; note: string }[]
}

interface FeedbackEntry {
  id: string
  feedbackType: "approval" | "change_request"
  message: string | null
  activityNotes: { activityId: string; activityName: string; note: string }[] | null
  status: "pending" | "reviewed" | "resolved"
  reviewedAt: string | null
  createdAt: string
  submittedBy: {
    firstName: string | null
    lastName: string | null
  }
}

export function useSubmitApproval(tripId: string, itineraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: FeedbackSubmission) =>
      getApiClient().post(
        `/client-portal/trips/${tripId}/itineraries/${itineraryId}/approve`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-itinerary", tripId, itineraryId] })
      queryClient.invalidateQueries({ queryKey: ["client-trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["feedback", itineraryId] })
    },
  })
}

export function useSubmitChangeRequest(tripId: string, itineraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: FeedbackSubmission) =>
      getApiClient().post(
        `/client-portal/trips/${tripId}/itineraries/${itineraryId}/request-changes`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", itineraryId] })
    },
  })
}

export function useFeedbackHistory(tripId: string, itineraryId: string) {
  return useQuery<FeedbackEntry[]>({
    queryKey: ["feedback", itineraryId],
    queryFn: () =>
      getApiClient().get<FeedbackEntry[]>(
        `/client-portal/trips/${tripId}/itineraries/${itineraryId}/feedback`
      ),
    enabled: !!tripId && !!itineraryId,
  })
}
