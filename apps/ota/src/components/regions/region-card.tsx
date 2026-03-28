import Link from 'next/link'
import { Globe, Ship } from 'lucide-react'
import type { Region } from '@/types/entities'

export function RegionCard({ region }: { region: Region }) {
  return (
    <Link
      href={`/regions/${region.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#C59746]/10">
        <Globe className="size-5 text-[#C59746]" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {region.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <Ship className="size-3.5" />
          {region.sailingCount.toLocaleString()} sailing{region.sailingCount !== 1 ? 's' : ''}
        </p>
      </div>
    </Link>
  )
}
