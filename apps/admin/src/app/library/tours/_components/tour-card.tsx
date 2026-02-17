'use client'

import { useState } from 'react'
import { Calendar, Globe, Compass, Map, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CatalogTourSummary } from '@/hooks/use-tour-library'

// Globus Family image base URL
const GLOBUS_IMAGE_BASE = 'https://images.globusfamily.com'

function getTourImageUrl(tourCode: string): string {
  return `${GLOBUS_IMAGE_BASE}/vacation/${tourCode}.jpg`
}

interface TourCardProps {
  tour: CatalogTourSummary
  onSelect: () => void
}

const BRAND_STYLES: Record<string, { badge: string; bg: string; icon: string }> = {
  globus: {
    badge: 'bg-blue-600 text-white hover:bg-blue-600',
    bg: 'from-blue-600 via-blue-500 to-sky-400',
    icon: 'text-blue-200/40',
  },
  cosmos: {
    badge: 'bg-amber-600 text-white hover:bg-amber-600',
    bg: 'from-amber-600 via-amber-500 to-orange-400',
    icon: 'text-amber-200/40',
  },
  monograms: {
    badge: 'bg-purple-600 text-white hover:bg-purple-600',
    bg: 'from-purple-600 via-purple-500 to-fuchsia-400',
    icon: 'text-purple-200/40',
  },
}

const DEFAULT_STYLE = {
  badge: 'bg-phoenix-gold-600 text-white hover:bg-phoenix-gold-600',
  bg: 'from-phoenix-gold-600 via-teal-500 to-cyan-400',
  icon: 'text-teal-200/40',
}

// Pick a decorative icon based on tour code hash for variety
const DECO_ICONS = [Globe, Compass, Map]
function decoIcon(code: string) {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h + code.charCodeAt(i)) % DECO_ICONS.length
  return DECO_ICONS[h]!
}

// Format operator code for display
function formatOperator(code: string): string {
  return code.charAt(0).toUpperCase() + code.slice(1)
}

export function TourCard({ tour, onSelect }: TourCardProps) {
  const code = tour.providerIdentifier
  const style = BRAND_STYLES[tour.operatorCode.toLowerCase()] || DEFAULT_STYLE
  const DecoIcon = decoIcon(code)
  const [imageError, setImageError] = useState(false)
  const imageUrl = tour.imageUrl || getTourImageUrl(code)

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all duration-200',
        'hover:shadow-lg hover:border-phoenix-gold-300',
        'focus-within:ring-2 focus-within:ring-phoenix-gold-500 focus-within:ring-offset-2',
      )}
      onClick={onSelect}
    >
      {/* Tour image header with gradient fallback */}
      <div className={cn('relative h-24 bg-gradient-to-br overflow-hidden', style.bg)}>
        {/* Tour image */}
        {!imageError && (
          <img
            src={imageUrl}
            alt={tour.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        )}
        {/* Decorative icon (shown on image error or as overlay) */}
        <DecoIcon className={cn('absolute -bottom-3 -right-3 h-20 w-20', style.icon, !imageError && 'opacity-0')} />

        <Badge className={cn('absolute top-2.5 left-2.5 text-xs font-semibold shadow-sm', style.badge)}>
          {formatOperator(tour.operatorCode)}
        </Badge>
        <Badge
          className="absolute top-2.5 right-2.5 text-xs font-mono bg-white/20 text-white backdrop-blur-sm border-white/30 hover:bg-white/20"
        >
          {code}
        </Badge>
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Tour Name */}
        <h3 className="font-semibold text-sm text-ash-900 line-clamp-2 leading-tight min-h-[2.5rem]">
          {tour.name}
        </h3>

        {/* Tour details */}
        <div className="flex items-center gap-3 text-xs text-ash-500">
          {tour.days && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>{tour.days} days</span>
            </div>
          )}
          {tour.season && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span>{tour.season}</span>
            </div>
          )}
        </div>

        {/* Pricing & Departures */}
        <div className="flex items-center justify-between text-xs">
          {tour.lowestPriceCents ? (
            <span className="font-medium text-phoenix-gold-700">
              From ${(tour.lowestPriceCents / 100).toLocaleString()}
            </span>
          ) : (
            <span className="text-ash-400">Price on request</span>
          )}
          {tour.departureCount && tour.departureCount > 0 && (
            <span className="text-ash-500">
              {tour.departureCount} departure{tour.departureCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* CTA */}
        <div className="pt-2 border-t border-ash-100">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
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
