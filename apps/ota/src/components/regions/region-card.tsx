'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ship } from 'lucide-react'
import type { Region } from '@/types/entities'

/**
 * Curated Unsplash photo IDs for known cruise regions.
 * Keys are region slugs (or partial matches).
 */
const REGION_IMAGES: Record<string, string> = {
  'caribbean': 'photo-1580541631950-7282082b53ce',
  'mediterranean': 'photo-1523906834658-6e24ef2386f9',
  'alaska': 'photo-1531176175280-5a0f4ae4e14e',
  'northern-europe': 'photo-1513622470522-26c3c8a854bc',
  'scandinavia': 'photo-1513622470522-26c3c8a854bc',
  'asia': 'photo-1540959733332-eab4deabeeaf',
  'south-pacific': 'photo-1559128010-7c1ad6e1b6a5',
  'pacific': 'photo-1559128010-7c1ad6e1b6a5',
  'hawaii': 'photo-1542259009477-d625272157b7',
  'bahamas': 'photo-1548574505-5e239809ee19',
  'bermuda': 'photo-1544551763-46a013bb70d5',
  'mexico': 'photo-1518105779142-d975f22f1b0a',
  'australia': 'photo-1523482580672-f109ba8cb9be',
  'new-zealand': 'photo-1507699622108-4be3abd695ad',
  'middle-east': 'photo-1518684079-3c830dcef090',
  'dubai': 'photo-1518684079-3c830dcef090',
  'africa': 'photo-1516026672322-bc52d61a55d5',
  'south-america': 'photo-1483729558449-99ef09a8c325',
  'antarctica': 'photo-1552733407-5d5c46c3bb3b',
  'arctic': 'photo-1552733407-5d5c46c3bb3b',
  'transatlantic': 'photo-1505118380757-91f5f5632de0',
  'world': 'photo-1500835556837-99ac94a94552',
  'europe': 'photo-1467269204594-9661b134dd2b',
  'indian-ocean': 'photo-1590523277543-a94d2e4eb00b',
  'river': 'photo-1504280390367-361c6d9f38f4',
  'galapagos': 'photo-1544735716-392fe2489ffa',
  'canada': 'photo-1503614472-8c93d56e92ce',
  'new-england': 'photo-1507003211169-0a1dd7228f2d',
  'british-isles': 'photo-1513622470522-26c3c8a854bc',
  'southeast-asia': 'photo-1528181304800-259b08848526',
  'japan': 'photo-1539037116277-4db20889f2d7',
  'china': 'photo-1547981609-4b6bfe67ca0b',
}

/** Default cruise/ocean photos for unknown regions */
const DEFAULT_REGION_PHOTOS = [
  'photo-1505118380757-91f5f5632de0',
  'photo-1530521954074-e64f6810b32d',
  'photo-1548574505-5e239809ee19',
  'photo-1544551763-46a013bb70d5',
  'photo-1507400492013-162706c8c05e',
]

const REGION_FALLBACK = '/images/destinations/cruise-fallback.svg'

/**
 * Resolve region slug to an Unsplash photo URL.
 * Tries exact match first, then partial slug matching, then falls back to defaults.
 */
function getRegionImage(slug: string, name: string): string {
  // Exact match
  if (REGION_IMAGES[slug]) {
    return `https://images.unsplash.com/${REGION_IMAGES[slug]}?w=600&h=400&fit=crop&auto=format&q=75`
  }

  // Partial match: check if any key is contained in the slug or vice-versa
  for (const [key, photoId] of Object.entries(REGION_IMAGES)) {
    if (slug.includes(key) || key.includes(slug)) {
      return `https://images.unsplash.com/${photoId}?w=600&h=400&fit=crop&auto=format&q=75`
    }
  }

  // Deterministic fallback from default pool
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const photoId = DEFAULT_REGION_PHOTOS[hash % DEFAULT_REGION_PHOTOS.length]
  return `https://images.unsplash.com/${photoId}?w=600&h=400&fit=crop&auto=format&q=75`
}

export function RegionCard({ region }: { region: Region }) {
  const initialSrc = getRegionImage(region.slug, region.name)
  const [imgSrc, setImgSrc] = useState(initialSrc)

  const handleError = () => {
    if (imgSrc !== REGION_FALLBACK) {
      setImgSrc(REGION_FALLBACK)
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
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {/* Sailing count badge */}
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#1A1A1A] shadow-sm">
          <Ship className="size-3" />
          {region.sailingCount.toLocaleString()}
        </span>
        {/* Region name */}
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
