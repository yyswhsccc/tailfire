import Link from 'next/link'
import type { DestinationSummary } from '@/types/entities'

/**
 * Curated Unsplash travel photo IDs for destination cards.
 * Using direct images.unsplash.com URLs (the source.unsplash.com endpoint is deprecated/503).
 * Each destination gets a consistent photo based on a hash of its name.
 */
const TRAVEL_PHOTOS = [
  'photo-1507525428034-b723cf961d3e', // tropical beach
  'photo-1476514525535-07fb3b4ae5f1', // lake mountains
  'photo-1502602898657-3e91760cbb34', // eiffel tower
  'photo-1506929562872-bb421503ef21', // ocean sunset
  'photo-1519922639192-e73293ca430e', // sunset bridge
  'photo-1504280390367-361c6d9f38f4', // camping mountains
  'photo-1523906834658-6e24ef2386f9', // venice canal
  'photo-1530789253388-582c481c54b0', // tropical resort
  'photo-1544735716-392fe2489ffa', // greek island
  'photo-1512100356356-de1b84283e18', // norway fjord
  'photo-1539037116277-4db20889f2d7', // cherry blossoms
  'photo-1493976040374-85c8e12f0c0e', // city skyline
  'photo-1528702748617-c64d49f918af', // palm trees
  'photo-1590523277543-a94d2e4eb00b', // maldives
  'photo-1501785888041-af3ef285b470', // mountains lake
  'photo-1473186505569-9c61870c11f9', // coastal cliff
  'photo-1518548419970-58e3b4079ab2', // desert dunes
  'photo-1514282401047-d79a71a590e8', // island aerial
  'photo-1552733407-5d5c46c3bb3b', // northern lights
  'photo-1547471080-7cc2caa01a7e', // beach chairs
  'photo-1500835556837-99ac94a94552', // airplane wing
  'photo-1499856871958-5b9627545d1a', // fireworks city
  'photo-1542314831-068cd1dbfeeb', // hotel lobby
  'photo-1571003123894-1f0594d2b5d9', // villa pool
]

function getDestinationImage(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const photoId = TRAVEL_PHOTOS[hash % TRAVEL_PHOTOS.length]
  return `https://images.unsplash.com/${photoId}?w=600&h=400&fit=crop&auto=format&q=75`
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
