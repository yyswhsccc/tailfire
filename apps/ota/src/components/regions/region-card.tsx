'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ship } from 'lucide-react'
import type { Region } from '@/types/entities'

/** Regions that are cruise-specific get the cruise image; others get the generic region image. */
function getRegionImage(_name: string): string {
  return '/images/destinations/cruise.jpg'
}

export function RegionCard({ region }: { region: Region }) {
  const initialSrc = getRegionImage(region.name)
  const [imgSrc, setImgSrc] = useState(initialSrc)

  function handleError() {
    if (imgSrc !== '/images/destinations/default.jpg') {
      setImgSrc('/images/destinations/default.jpg')
    }
  }

  return (
    <Link
      href={`/regions/${region.slug}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-48 overflow-hidden">
        <img
          src={imgSrc}
          alt={region.name}
          loading="lazy"
          onError={handleError}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {/* Sailing count badge */}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#1A1A1A] shadow-sm">
          <Ship className="size-3" />
          {region.sailingCount.toLocaleString()}
        </span>
        {/* Region name overlaid on image */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-base font-bold text-white drop-shadow-md group-hover:text-[#C59746] transition-colors">
            {region.name}
          </h3>
          <p className="mt-0.5 text-xs text-white/80 drop-shadow-sm">
            {region.sailingCount.toLocaleString()} sailing{region.sailingCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </Link>
  )
}
