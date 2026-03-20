'use client'

import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type {
  FlightOfferSearchParams,
  FlightOfferSearchResponse,
  TransferSearchParams,
  TransferSearchResponse,
  TourActivitySearchParams,
  TourActivitySearchResponse,
} from '@tailfire/shared-types'
import { useToast } from './use-toast'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const externalApiKeys = {
  flightOffers: (params: Partial<FlightOfferSearchParams>) =>
    ['flight-offers', params] as const,
  transfers: (params: Partial<TransferSearchParams>) =>
    ['transfer-search', params] as const,
  activities: (params: Partial<TourActivitySearchParams>) =>
    ['activity-search', params] as const,
}

// ============================================================================
// FLIGHT OFFERS SEARCH
// ============================================================================

export function useFlightOfferSearch(
  params: Partial<FlightOfferSearchParams>,
  options: { enabled?: boolean } = {}
) {
  const { enabled = false } = options
  const { toast } = useToast()

  return useQuery({
    queryKey: externalApiKeys.flightOffers(params),
    queryFn: async (): Promise<FlightOfferSearchResponse> => {
      const queryParams = new URLSearchParams()
      if (params.origin) queryParams.set('origin', params.origin)
      if (params.destination) queryParams.set('destination', params.destination)
      if (params.departureDate) queryParams.set('departureDate', params.departureDate)
      if (params.returnDate) queryParams.set('returnDate', params.returnDate)
      if (params.adults) queryParams.set('adults', String(params.adults))
      if (params.travelClass) queryParams.set('travelClass', params.travelClass)
      if (params.nonStop) queryParams.set('nonStop', 'true')
      if (params.maxPrice) queryParams.set('maxPrice', String(params.maxPrice))
      if (params.currencyCode) queryParams.set('currencyCode', params.currencyCode)

      try {
        return await api.get<FlightOfferSearchResponse>(
          `/external-apis/flights/offers/search?${queryParams}`
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) {
          toast({
            title: 'Rate limit reached',
            description: 'Please wait before searching again.',
            variant: 'default',
          })
        }
        throw error
      }
    },
    enabled: enabled && !!params.origin && !!params.destination && !!params.departureDate,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) return false
      return failureCount < 1
    },
  })
}

// ============================================================================
// TRANSFER SEARCH
// ============================================================================

export function useTransferSearch(
  params: Partial<TransferSearchParams>,
  options: { enabled?: boolean } = {}
) {
  const { enabled = false } = options
  const { toast } = useToast()

  return useQuery({
    queryKey: externalApiKeys.transfers(params),
    queryFn: async (): Promise<TransferSearchResponse> => {
      const queryParams = new URLSearchParams()
      if (params.pickupType) queryParams.set('pickupType', params.pickupType)
      if (params.pickupCode) queryParams.set('pickupCode', params.pickupCode)
      if (params.pickupLat !== undefined) queryParams.set('pickupLat', String(params.pickupLat))
      if (params.pickupLng !== undefined) queryParams.set('pickupLng', String(params.pickupLng))
      if (params.pickupAddress) queryParams.set('pickupAddress', params.pickupAddress)
      if (params.pickupCountryCode) queryParams.set('pickupCountryCode', params.pickupCountryCode)
      if (params.dropoffType) queryParams.set('dropoffType', params.dropoffType)
      if (params.dropoffCode) queryParams.set('dropoffCode', params.dropoffCode)
      if (params.dropoffLat !== undefined) queryParams.set('dropoffLat', String(params.dropoffLat))
      if (params.dropoffLng !== undefined) queryParams.set('dropoffLng', String(params.dropoffLng))
      if (params.dropoffAddress) queryParams.set('dropoffAddress', params.dropoffAddress)
      if (params.dropoffCountryCode) queryParams.set('dropoffCountryCode', params.dropoffCountryCode)
      if (params.date) queryParams.set('date', params.date)
      if (params.time) queryParams.set('time', params.time)
      if (params.passengers) queryParams.set('passengers', String(params.passengers))

      try {
        return await api.get<TransferSearchResponse>(
          `/external-apis/transfers/search?${queryParams}`
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) {
          toast({
            title: 'Rate limit reached',
            description: 'Please wait before searching again.',
            variant: 'default',
          })
        }
        throw error
      }
    },
    enabled: enabled && !!params.pickupType && !!params.dropoffType && !!params.date && !!params.time,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) return false
      return failureCount < 1
    },
  })
}

// ============================================================================
// ACTIVITY SEARCH
// ============================================================================

export function useActivitySearch(
  params: Partial<TourActivitySearchParams>,
  options: { enabled?: boolean } = {}
) {
  const { enabled = false } = options
  const { toast } = useToast()

  return useQuery({
    queryKey: externalApiKeys.activities(params),
    queryFn: async (): Promise<TourActivitySearchResponse> => {
      const queryParams = new URLSearchParams()
      if (params.latitude !== undefined) queryParams.set('latitude', String(params.latitude))
      if (params.longitude !== undefined) queryParams.set('longitude', String(params.longitude))
      if (params.radius) queryParams.set('radius', String(params.radius))
      if (params.keyword) queryParams.set('keyword', params.keyword)

      try {
        return await api.get<TourActivitySearchResponse>(
          `/external-apis/activities/search?${queryParams}`
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) {
          toast({
            title: 'Rate limit reached',
            description: 'Please wait before searching again.',
            variant: 'default',
          })
        }
        throw error
      }
    },
    enabled: enabled && params.latitude !== undefined && params.longitude !== undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) return false
      return failureCount < 1
    },
  })
}
