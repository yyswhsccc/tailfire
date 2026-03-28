import Image from 'next/image'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import type { DestinationSummary } from '@/types/entities'

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 overflow-hidden bg-muted">
        {destination.heroImageUrl ? (
          <Image
            src={destination.heroImageUrl}
            alt={destination.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-100 to-teal-50">
            <MapPin className="size-8 text-muted-foreground/30" />
          </div>
        )}
        {destination.countryCode && (
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {destination.countryCode}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {destination.name}
        </h3>
        {destination.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{destination.summary}</p>
        )}
      </div>
    </Link>
  )
}
