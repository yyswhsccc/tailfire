import Image from 'next/image'
import { Star, MapPin } from 'lucide-react'
import type { DestinationDetail } from '@/types/entities'

export function DestinationHero({ destination }: { destination: DestinationDetail }) {
  const enrichment = destination.enrichment
  const heroImage = destination.heroImageUrl || enrichment?.photos?.[0]?.url

  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {heroImage && (
        <Image
          src={heroImage}
          alt={destination.name}
          fill
          className="object-cover opacity-50"
          sizes="100vw"
          priority
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/50 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pb-14 lg:pt-32">
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-[#C59746]">
          <MapPin className="size-3" />
          {destination.destinationType.replace('_', ' ')}
          {destination.countryCode && ` \u00b7 ${destination.countryCode}`}
        </p>

        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
          {destination.name}
        </h1>

        {enrichment?.averageRating != null && enrichment.averageRating > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="size-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-semibold text-white">{enrichment.averageRating.toFixed(1)}</span>
            </div>
            {enrichment.totalReviewCount != null && enrichment.totalReviewCount > 0 && (
              <span className="text-sm text-white/60">
                ({enrichment.totalReviewCount.toLocaleString()} reviews)
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {destination.stats.cruiseCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {destination.stats.cruiseCount} cruises
            </span>
          )}
          {destination.stats.tourCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {destination.stats.tourCount} tours
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
