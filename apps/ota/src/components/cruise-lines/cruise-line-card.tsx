import Image from 'next/image'
import Link from 'next/link'
import { Ship, Anchor } from 'lucide-react'
import type { CruiseLine } from '@/types/entities'

export function CruiseLineCard({ line }: { line: CruiseLine }) {
  return (
    <Link
      href={`/cruise-lines/${line.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
        {line.logoUrl ? (
          <Image src={line.logoUrl} alt={line.name} width={56} height={56} className="object-contain" />
        ) : (
          <Anchor className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {line.name}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Ship className="size-3.5" />
            {line.shipCount} ship{line.shipCount !== 1 ? 's' : ''}
          </span>
          <span>{line.sailingCount.toLocaleString()} sailings</span>
        </div>
      </div>
    </Link>
  )
}
