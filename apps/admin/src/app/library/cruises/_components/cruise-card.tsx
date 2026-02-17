'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import { Ship, Calendar, MapPin, Anchor } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SailingSearchItem } from '@/hooks/use-cruise-library'

interface CruiseCardProps {
  sailing: SailingSearchItem
  onSelect: () => void
}

/**
 * Format price in dollars from cents
 */
function formatPrice(cents: number | null): string {
  if (cents === null) return 'Contact for Pricing'
  return `$${Math.round(cents / 100).toLocaleString()}`
}

/**
 * Get cheapest price from all cabin categories
 */
function getCheapestPrice(prices: SailingSearchItem['prices']): number | null {
  const available = [
    prices.inside,
    prices.oceanview,
    prices.balcony,
    prices.suite,
  ].filter((p): p is number => p !== null)

  return available.length > 0 ? Math.min(...available) : null
}

export function CruiseCard({ sailing, onSelect }: CruiseCardProps) {
  const [shipImageError, setShipImageError] = useState(false)
  const [logoImageError, setLogoImageError] = useState(false)
  const cheapestPrice = getCheapestPrice(sailing.prices)
  const sailDate = parseISO(sailing.sailDate)

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all duration-200',
        'hover:shadow-lg hover:border-phoenix-gold-300',
        'focus-within:ring-2 focus-within:ring-phoenix-gold-500 focus-within:ring-offset-2'
      )}
      onClick={onSelect}
    >
      {/* Ship Image */}
      <div className="relative h-36 bg-ash-100">
        {sailing.ship.imageUrl && !shipImageError ? (
          <Image
            src={sailing.ship.imageUrl}
            alt={sailing.ship.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            unoptimized
            onError={() => setShipImageError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Ship className="h-12 w-12 text-ash-300" />
          </div>
        )}

        {/* Cruise Line Logo Badge */}
        {sailing.cruiseLine.logoUrl && !logoImageError && (
          <div className="absolute top-2 left-2 bg-white rounded-lg p-1.5 shadow-md">
            <div className="relative w-9 h-9">
              <Image
                src={sailing.cruiseLine.logoUrl}
                alt={sailing.cruiseLine.name}
                fill
                className="rounded object-contain"
                sizes="36px"
                unoptimized
                onError={() => setLogoImageError(true)}
              />
            </div>
          </div>
        )}

        {/* Nights Badge */}
        <div className="absolute top-2 right-2 bg-phoenix-gold-600 text-white text-xs font-medium px-2 py-1 rounded-full">
          {sailing.nights} Nights
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Title */}
        <h3 className="font-semibold text-sm text-ash-900 line-clamp-2 leading-tight">
          {sailing.name}
        </h3>

        {/* Ship & Cruise Line */}
        <div className="flex items-center gap-1.5 text-xs text-ash-500">
          <Anchor className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {sailing.cruiseLine.name} - {sailing.ship.name}
          </span>
        </div>

        {/* Departure Date */}
        <div className="flex items-center gap-1.5 text-xs text-ash-500">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span>{format(sailDate, 'MMM d, yyyy')}</span>
        </div>

        {/* Departure Port */}
        <div className="flex items-center gap-1.5 text-xs text-ash-500">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{sailing.embarkPort.name}</span>
        </div>

        {/* Price & CTA */}
        <div className="flex items-center justify-between pt-2 border-t border-ash-100">
          <div>
            {cheapestPrice !== null ? (
              <>
                <span className="text-xs text-ash-500">From</span>
                <p className="text-lg font-bold text-phoenix-gold-600">
                  {formatPrice(cheapestPrice)}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-ash-500">
                Contact for Pricing
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            View Details
          </Button>
        </div>

      </CardContent>
    </Card>
  )
}
