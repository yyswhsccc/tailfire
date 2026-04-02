import Link from 'next/link'
import type { DestinationSummary } from '@/types/entities'

/**
 * Generate an Unsplash source URL for a destination.
 * Uses Unsplash Source (free, no API key) for consistent, beautiful destination photos.
 * The seed ensures the same destination always gets the same photo.
 */
function getDestinationImage(name: string, width = 600, height = 400): string {
  const query = encodeURIComponent(name.split(',')[0]?.trim() || name)
  // Use a hash of the name as seed for consistent images
  const seed = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return `https://source.unsplash.com/${width}x${height}/?${query},travel&sig=${seed}`
}

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const imageUrl = destination.heroImageUrl || getDestinationImage(destination.name)

  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-48 overflow-hidden">
        {/* Always show an image — hero or Unsplash fallback */}
        <img
          src={imageUrl}
          alt={destination.name}
          loading="lazy"
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
