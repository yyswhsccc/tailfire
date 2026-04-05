'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DestinationSummary } from '@/types/entities'
import { getCuratedImage } from '@/lib/curated-images'

/** Local fallback images by destinationType for onError */
const LOCAL_FALLBACKS: Record<string, string> = {
  port_city: '/images/destinations/cruise-fallback.svg',
  island: '/images/destinations/island-fallback.svg',
  resort_area: '/images/destinations/tropical-fallback.svg',
  city: '/images/destinations/city-fallback.svg',
  country: '/images/destinations/travel-fallback.svg',
  region: '/images/destinations/mountain-fallback.svg',
}
const DEFAULT_FALLBACK = '/images/destinations/travel-fallback.svg'

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const initialSrc = destination.heroImageUrl || getCuratedImage(destination.name, destination.destinationType)
  const [imgSrc, setImgSrc] = useState(initialSrc)

  const handleError = () => {
    const fallback = LOCAL_FALLBACKS[destination.destinationType] || DEFAULT_FALLBACK
    // Only switch to fallback if we are not already on it (prevent infinite loop)
    if (imgSrc !== fallback) {
      setImgSrc(fallback)
    }
  }

  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-48 overflow-hidden">
        <img
          src={imgSrc}
          alt={destination.name}
          loading="lazy"
          onError={handleError}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {/* Country badge */}
        {destination.countryCode && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#1A1A1A] shadow-sm">
            {destination.countryCode}
          </span>
        )}
        {/* Destination name overlaid on image */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-base font-bold text-white drop-shadow-md group-hover:text-[#C59746] transition-colors">
            {destination.name}
          </h3>
          {destination.summary && (
            <p className="mt-0.5 line-clamp-1 text-xs text-white/80 drop-shadow-sm">{destination.summary}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
