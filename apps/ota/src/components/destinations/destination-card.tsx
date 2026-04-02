'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DestinationSummary } from '@/types/entities'

function getFallbackImage(type?: string): string {
  const typeMap: Record<string, string> = {
    city: '/images/destinations/city.jpg',
    port_city: '/images/destinations/port_city.jpg',
    island: '/images/destinations/island.jpg',
    resort_area: '/images/destinations/resort_area.jpg',
    country: '/images/destinations/country.jpg',
    region: '/images/destinations/region.jpg',
  }
  return typeMap[type || ''] || '/images/destinations/default.jpg'
}

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const fallbackSrc = getFallbackImage(destination.destinationType)
  const initialSrc = destination.heroImageUrl || fallbackSrc
  const [imgSrc, setImgSrc] = useState(initialSrc)

  function handleError() {
    if (imgSrc !== '/images/destinations/default.jpg') {
      setImgSrc('/images/destinations/default.jpg')
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
