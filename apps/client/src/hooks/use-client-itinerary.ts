"use client"

import { useQuery } from "@tanstack/react-query"
import { getApiClient } from "@/lib/api-client"

export interface ItineraryActivity {
  id: string
  itineraryDayId: string | null
  activityType: string
  name: string
  description: string | null
  sequenceOrder: number
  startDatetime: string | null
  endDatetime: string | null
  timezone: string | null
  location: string | null
  address: string | null
  coordinates: { lat: number; lng: number } | null
  confirmationNumber: string | null
  proposalStatus: string | null
  bookingStatus: string
  photos: { url: string; caption?: string }[] | null
}

export interface ItineraryDay {
  id: string
  dayNumber: number
  date: string | null
  title: string | null
  description: string | null
  location: string | null
  activities: ItineraryActivity[]
}

export interface ClientItinerary {
  id: string
  name: string
  description: string | null
  status: string
  startDate: string | null
  endDate: string | null
  coverPhoto: string | null
  overview: string | null
  primaryDestinationName: string | null
  secondaryDestinationName: string | null
  pricingVisibility: string
  days: ItineraryDay[]
}

export function useClientItinerary(tripId: string, itineraryId: string) {
  return useQuery<ClientItinerary>({
    queryKey: ["client-itinerary", tripId, itineraryId],
    queryFn: () =>
      getApiClient().get<ClientItinerary>(
        `/client-portal/trips/${tripId}/itineraries/${itineraryId}`
      ),
    enabled: !!tripId && !!itineraryId,
  })
}
