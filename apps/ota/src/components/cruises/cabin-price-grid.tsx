import { formatPrice } from '@/lib/format'

interface CabinPriceGridProps {
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
}

const CABIN_TIERS = [
  { key: 'inside' as const, label: 'Inside', color: 'bg-slate-100 text-slate-700' },
  { key: 'oceanview' as const, label: 'Ocean View', color: 'bg-sky-50 text-sky-700' },
  { key: 'balcony' as const, label: 'Balcony', color: 'bg-amber-50 text-amber-700' },
  { key: 'suite' as const, label: 'Suite', color: 'bg-violet-50 text-violet-700' },
]

export function CabinPriceGrid({ prices }: CabinPriceGridProps) {
  const available = CABIN_TIERS.filter((t) => prices[t.key] != null)
  if (available.length === 0) {
    return <p className="text-sm text-muted-foreground">Contact for pricing</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {available.map((tier) => (
        <div key={tier.key} className={`flex items-center justify-between rounded-xl border border-border p-3.5 ${tier.color}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{tier.label}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{formatPrice(prices[tier.key]!)}</p>
            <p className="text-[10px] opacity-60">per person</p>
          </div>
        </div>
      ))}
    </div>
  )
}
