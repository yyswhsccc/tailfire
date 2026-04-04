'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTravelSession } from '@/stores/travel-session-store'
import { HotelProductCard } from '@/components/cards/hotel-product-card'
import type { HotelProductCardProps } from '@/components/cards/hotel-product-card'

// ---------------------------------------------------------------------------
// API response shape (matches HotelOffer from /ota/search/hotels)
// ---------------------------------------------------------------------------

interface HotelPriceOffer {
  checkIn: string
  checkOut: string
  roomType?: string
  price: { currency: string; total: string; base?: string; taxes?: string }
  cancellationPolicy?: { deadline?: string; refundable?: boolean; description?: string }
  boardType?: string
}

interface HotelOffer {
  id: string
  placeId?: string
  hotelId?: string
  name: string
  description?: string
  location: {
    address: string
    city?: string
    country?: string
    postalCode?: string
    latitude?: number
    longitude?: number
  }
  phone?: string
  website?: string
  rating?: number
  reviewCount?: number
  starRating?: number
  photos?: { url: string; thumbnailUrl?: string }[]
  amenities?: string[]
  offers?: HotelPriceOffer[]
  provider: string
}

// ---------------------------------------------------------------------------
// Mapping helpers (moved from the server component)
// ---------------------------------------------------------------------------

const BOARD_BASIS_LABELS: Record<string, string> = {
  ROOM_ONLY: 'Room Only',
  BREAKFAST: 'Breakfast Included',
  HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board',
  ALL_INCLUSIVE: 'All Inclusive',
}

function hotelOfferToCardProps(hotel: HotelOffer): HotelProductCardProps {
  const bestOffer = hotel.offers?.[0]
  const locationParts = [hotel.location.city, hotel.location.country].filter(Boolean)
  const priceCents = bestOffer
    ? Math.round(parseFloat(bestOffer.price.total) * 100) || null
    : null
  const boardType = bestOffer?.boardType
    ? (BOARD_BASIS_LABELS[bestOffer.boardType] ?? bestOffer.boardType)
    : undefined

  return {
    id: hotel.id,
    name: hotel.name,
    imageUrl: hotel.photos?.[0]?.url ?? null,
    starRating: hotel.starRating,
    userRating: hotel.rating,
    reviewCount: hotel.reviewCount,
    amenities: hotel.amenities,
    location: locationParts.join(', ') || undefined,
    boardType,
    priceCents,
    checkInDate: bestOffer?.checkIn,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ClientHotelResultsProps {
  destinationName: string
  latitude?: number | null   // preferred for geo-based search
  longitude?: number | null  // preferred for geo-based search
  /** Server-rendered date prompt fallback */
  children: React.ReactNode
}

export function ClientHotelResults({
  destinationName,
  latitude,
  longitude,
  children,
}: ClientHotelResultsProps) {
  const { departureDate, returnDate, adults } = useTravelSession()
  const [hotels, setHotels] = useState<HotelProductCardProps[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const hasDates = !!(departureDate && returnDate)

  const fetchHotels = useCallback(async () => {
    if (!departureDate || !returnDate) return

    const baseParams: Record<string, string> = {
      checkIn: departureDate,
      checkOut: returnDate,
      adults: String(adults),
    }
    if (latitude != null && longitude != null) {
      baseParams.latitude = String(latitude)
      baseParams.longitude = String(longitude)
      baseParams.radius = '10000'
    } else {
      baseParams.destination = destinationName
    }
    const qs = new URLSearchParams(baseParams)

    const res = await fetch(`/api/hotels/search?${qs}`)
    if (!res.ok) throw new Error('Hotel search failed')

    const data: { results?: HotelOffer[] } = await res.json()
    const results = (data.results || []).slice(0, 4)
    return results.map(hotelOfferToCardProps)
  }, [departureDate, returnDate, adults, destinationName, latitude, longitude])

  useEffect(() => {
    if (!hasDates) {
      setHotels([])
      setFetched(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetchHotels()
      .then((mapped) => {
        if (!cancelled) {
          setHotels(mapped ?? [])
          setFetched(true)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHotels([])
          setFetched(true)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [hasDates, fetchHotels])

  // Loading skeleton
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  // Real data available
  if (fetched && hotels.length > 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hotels.map((hotel) => (
          <HotelProductCard key={hotel.id} variant="full" {...hotel} />
        ))}
      </div>
    )
  }

  // No dates set or fetch returned no results — show server-rendered fallback
  return <>{children}</>
}
