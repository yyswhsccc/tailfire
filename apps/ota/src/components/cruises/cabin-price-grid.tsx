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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {available.map((tier) => (
        <div key={tier.key} className={`rounded-xl border border-border p-4 ${tier.color}`}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">{tier.label}</p>
          <p className="mt-1 text-xl font-bold">{formatPrice(prices[tier.key]!)}</p>
          <p className="text-xs opacity-60">per person</p>
        </div>
      ))}
    </div>
  )
}
