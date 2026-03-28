import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { formatPrice } from '@/lib/format'

interface CruiseCardProps {
  id: string
  name: string
  shipName: string
  shipImageUrl: string | null
  cruiseLineName: string
  sailDate: string
  nights: number
  route?: string
  cheapestPriceCents: number | null
  savingsLabel?: string
  originalPriceCents?: number | null
}

export function CruiseCard({
  id, name, shipName, shipImageUrl, cruiseLineName,
  sailDate, nights, route, cheapestPriceCents, savingsLabel, originalPriceCents,
}: CruiseCardProps) {
  if (!shipImageUrl) return null

  const dateStr = new Date(sailDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <Link
      href={`/cruises/${id}`}
      className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-48 overflow-hidden sm:h-52">
        <SafeImage
          src={shipImageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          hideOnError
        />
        <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
          🚢 {nights} Nights
        </span>
        <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
          {cruiseLineName}
        </span>
        {savingsLabel && (
          <span className="absolute left-2.5 top-2.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
            {savingsLabel}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{name}</h3>
        <p className="mt-1 text-sm text-[#888]">{shipName} · {dateStr}</p>
        {route && <p className="mt-1 text-xs text-[#aaa]">{route}</p>}
        {cheapestPriceCents != null && (
          <div className="mt-3">
            {originalPriceCents != null && (
              <span className="mr-2 text-sm text-[#aaa] line-through">{formatPrice(originalPriceCents)}</span>
            )}
            <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(cheapestPriceCents)}</span>
            <span className="ml-1 text-xs text-[#888]">/person</span>
          </div>
        )}
      </div>
    </Link>
  )
}
