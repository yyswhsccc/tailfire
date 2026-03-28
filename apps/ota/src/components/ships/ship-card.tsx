import Image from 'next/image'
import Link from 'next/link'
import { Ship as ShipIcon, Calendar } from 'lucide-react'

interface ShipCardProps {
  ship: {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    shipClass: string | null
  }
  sailingCount?: number
}

export function ShipCard({ ship, sailingCount }: ShipCardProps) {
  return (
    <Link
      href={`/ships/${ship.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 overflow-hidden bg-muted">
        {ship.imageUrl ? (
          <Image
            src={ship.imageUrl}
            alt={ship.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShipIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {ship.name}
        </h3>
        {ship.shipClass && (
          <p className="mt-0.5 text-xs text-muted-foreground">{ship.shipClass} Class</p>
        )}
        {sailingCount != null && sailingCount > 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            {sailingCount} upcoming sailing{sailingCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Link>
  )
}
