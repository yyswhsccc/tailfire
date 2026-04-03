// apps/ota/src/components/cards/ship-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'

export interface ShipCardProps {
  slug: string
  name: string
  cruiseLineName: string
  imageUrl: string | null
  passengerCapacity?: number
  tonnage?: number
  yearBuilt?: number
}

export function ShipCard({
  slug,
  name,
  cruiseLineName,
  imageUrl,
  passengerCapacity,
  tonnage,
  yearBuilt,
}: ShipCardProps) {
  const stats: string[] = []
  if (passengerCapacity) stats.push(`${passengerCapacity.toLocaleString()} guests`)
  if (tonnage) stats.push(`${(tonnage / 1000).toFixed(0)}K GRT`)
  if (yearBuilt) stats.push(`Built ${yearBuilt}`)

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#E0E0E0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/ships/${slug}`} className="block">
        <div className="relative h-44 overflow-hidden sm:h-48">
          <SafeImage
            src={imageUrl ?? ''}
            alt={name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-3xl text-[#C59746]">
                🚢
              </div>
            }
          />
          <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
            {cruiseLineName}
          </span>
        </div>
      </Link>
      <div className="p-4">
        <Link href={`/ships/${slug}`}>
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{name}</h3>
          {stats.length > 0 && (
            <p className="mt-1 text-xs text-[#888]">{stats.join(' · ')}</p>
          )}
        </Link>
      </div>
    </div>
  )
}
