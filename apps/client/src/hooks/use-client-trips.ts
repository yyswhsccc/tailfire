"use client"

import { useQuery } from "@tanstack/react-query"
import { getApiClient } from "@/lib/api-client"

export interface ClientTrip {
  tripId: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  coverPhotoUrl: string | null
  tripType: string | null
  travelerRole: string
}

export interface ClientTripDetail {
  id: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  coverPhotoUrl: string | null
  tripType: string | null
  pricingVisibility: string
  itineraries: {
    id: string
    name: string
    description: string | null
    status: string
    startDate: string | null
    endDate: string | null
    coverPhoto: string | null
    overview: string | null
    primaryDestinationName: string | null
    sequenceOrder: number
  }[]
  travelers: {
    id: string
    role: string
    travelerType: string
    firstName: string | null
    lastName: string | null
    preferredName: string | null
  }[]
}

export function useClientTrips() {
  return useQuery<ClientTrip[]>({
    queryKey: ["client-trips"],
    queryFn: () => getApiClient().get<ClientTrip[]>("/client-portal/trips"),
  })
}

export function useClientTrip(tripId: string) {
  return useQuery<ClientTripDetail>({
    queryKey: ["client-trip", tripId],
    queryFn: () => getApiClient().get<ClientTripDetail>(`/client-portal/trips/${tripId}`),
    enabled: !!tripId,
  })
}
