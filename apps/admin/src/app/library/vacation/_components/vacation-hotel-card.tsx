'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Hotel, MapPin, Star, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { VacationSearchResult } from '@/hooks/use-vacation-library'

interface VacationHotelCardProps {
  result: VacationSearchResult
  onSelect: () => void
  priceMode: 'perPerson' | 'grandTotal'
}

/**
 * Map long amenity names to short badge labels
 */
const AMENITY_SHORT_LABELS: Record<string, string> = {
  'Directly on the beach': 'Beach',
  'Spa': 'Spa',
  'Wifi': 'WiFi',
  'Mini-club': 'Kids',
  'Family': 'Family',
  'Golf': 'Golf',
  'Casino': 'Casino',
  'Adults only': '18+',
}

function getShortAmenityLabel(amenity: string): string {
  return AMENITY_SHORT_LABELS[amenity] ?? amenity
}

/**
 * Format price in dollars from cents
 */
function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

/**
 * Find the cheapest package option by totalPrice (per person)
 */
function getCheapestPackage(packages: VacationSearchResult['packages']) {
  if (packages.length === 0) return null
  return packages.reduce((min, pkg) =>
    pkg.totalPrice < min.totalPrice ? pkg : min
  )
}

const MAX_VISIBLE_AMENITIES = 6

export function VacationHotelCard({ result, onSelect, priceMode }: VacationHotelCardProps) {
  const [imageError, setImageError] = useState(false)
  const cheapest = getCheapestPackage(result.packages)

  const visibleAmenities = result.amenities.slice(0, MAX_VISIBLE_AMENITIES)
  const hiddenCount = Math.max(0, result.amenities.length - MAX_VISIBLE_AMENITIES)

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all duration-200',
        'hover:shadow-lg hover:border-amber-400/50 hover:scale-[1.01]',
        'focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2'
      )}
      onClick={onSelect}
    >
      {/* Hotel Image */}
      <div className="relative h-36 bg-ash-100">
        {result.imageUrl && !imageError ? (
          <Image
            src={result.imageUrl}
            alt={result.hotelName}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            unoptimized
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Hotel className="h-12 w-12 text-ash-300" />
          </div>
        )}

        {/* Star Rating Badge — top left */}
        {result.starRating > 0 && (
          <div className="absolute top-2 left-2 bg-white/90 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span>{result.starRating}</span>
          </div>
        )}

        {/* Package Count Badge — top right */}
        <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-medium px-2 py-1 rounded-full">
          {result.packages.length} {result.packages.length === 1 ? 'option' : 'options'}
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Hotel Name */}
        <h3 className="font-semibold text-sm text-ash-900 line-clamp-2 leading-tight">
          {result.hotelName}
        </h3>

        {/* Destination */}
        <div className="flex items-center gap-1.5 text-xs text-ash-500">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{result.destination}</span>
        </div>

        {/* Monarc Rating */}
        {result.monarcRating && (
          <div className="text-xs text-ash-500">
            <span className="font-medium text-amber-600">
              Monarc {result.monarcRating}
            </span>
            {result.monarcReviewCount > 0 && (
              <span className="ml-1">
                ({result.monarcReviewCount.toLocaleString()} {result.monarcReviewCount === 1 ? 'review' : 'reviews'})
              </span>
            )}
          </div>
        )}

        {/* Amenities */}
        {result.amenities.length > 0 && (
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-wrap gap-1">
              {visibleAmenities.map((amenity) => (
                <Tooltip key={amenity}>
                  <TooltipTrigger asChild>
                    <div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {getShortAmenityLabel(amenity)}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{amenity}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {hiddenCount > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{hiddenCount}
                </Badge>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* Price & Tour Operator */}
        <div className="pt-2 border-t border-ash-100 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              {cheapest ? (
                <>
                  <span className="text-xs text-ash-500">from</span>
                  <p className="text-lg font-bold text-amber-600">
                    {priceMode === 'perPerson'
                      ? `${formatPrice(cheapest.totalPrice)}/pp`
                      : `${formatPrice(cheapest.grandTotal)} total`}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-ash-500">
                  No pricing available
                </p>
              )}
            </div>
            {cheapest && (
              <Badge variant="secondary" className="text-[10px]">
                {cheapest.tourOperator}
              </Badge>
            )}
          </div>

          {/* View Details Button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            <Package className="h-3.5 w-3.5 mr-1.5" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
