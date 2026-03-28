interface FlightCardProps {
  airline: string
  origin: string
  destination: string
  duration: string
  stops: number
  frequency?: string
  priceCad: string
  priceLabel?: string
}

export function FlightCard({ airline, origin, destination, duration, stops, frequency, priceCad, priceLabel }: FlightCardProps) {
  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#1A1A1A]">{airline}</span>
        {stops === 0 ? (
          <span className="rounded-xl bg-[#edf7ee] px-2.5 py-0.5 text-[11px] font-medium text-[#2a9d3a]">Direct</span>
        ) : (
          <span className="text-[11px] text-[#888]">{stops} stop{stops > 1 ? 's' : ''}</span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-[#888]">{origin} → {destination} · {duration}</p>
      {frequency && <p className="mt-0.5 text-xs text-[#aaa]">{frequency}</p>}
      <p className="mt-2.5 text-xl font-bold text-[#C59746] sm:text-[22px]">{priceCad}</p>
      {priceLabel && <p className="text-[11px] text-[#aaa]">{priceLabel}</p>}
    </div>
  )
}
