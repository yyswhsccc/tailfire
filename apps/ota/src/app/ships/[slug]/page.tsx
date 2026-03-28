import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchShipBySlug, fetchShipImages } from '@/lib/fetchers/ships'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { CtaBar } from '@/components/entity/cta-bar'
import { ShipGallery } from '@/components/ships/ship-gallery'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Users, Calendar, Anchor } from 'lucide-react'
import type { ShipImage } from '@/types/entities'

export const revalidate = 3600

interface ShipPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ShipPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const ship = await fetchShipBySlug(slug)
    return {
      title: `${ship.name} — ${ship.cruiseLine.name}`,
      description: `Explore ${ship.name} by ${ship.cruiseLine.name}. ${ship.upcomingSailingCount} upcoming sailings. Photos, cabin types, and deck plans.`,
    }
  } catch {
    return { title: 'Ship Not Found' }
  }
}

export default async function ShipDetailPage({ params }: ShipPageProps) {
  const { slug } = await params
  let ship
  try {
    ship = await fetchShipBySlug(slug)
  } catch {
    notFound()
  }

  let images: { images: ShipImage[]; total: number } = { images: [], total: 0 }
  try {
    images = await fetchShipImages(ship.id, 1, 12)
  } catch { /* images optional */ }

  const meta = ship.metadata || {}

  return (
    <>
      <PageContextBridge
        type="ship"
        slug={slug}
        name={ship.name}
        parentContext={{ type: 'cruise_line', slug: ship.cruiseLine.slug, name: ship.cruiseLine.name }}
      />

      <EntityHero title={ship.name} badge={ship.cruiseLine.name} imageUrl={ship.imageUrl}>
        <div className="flex flex-wrap gap-3">
          {meta.passengerCapacity && (
            <StatCard label="guests" value={meta.passengerCapacity.toLocaleString()} icon={<Users className="size-3.5" />} />
          )}
          <StatCard label="sailings" value={ship.upcomingSailingCount} icon={<Calendar className="size-3.5" />} />
          {meta.tonnage && <StatCard label="GT" value={`${Math.round(meta.tonnage / 1000)}K`} icon={<Anchor className="size-3.5" />} />}
        </div>
        <div className="mt-4">
          <CtaBar entityType="ship" entitySlug={slug} entityName={ship.name} inquirePrompt={`Tell me about the ${ship.name}`} />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {meta.yearBuilt && <InfoItem label="Built" value={String(meta.yearBuilt)} />}
              {ship.shipClass && <InfoItem label="Class" value={ship.shipClass} />}
              {meta.crewCount && <InfoItem label="Crew" value={meta.crewCount.toLocaleString()} />}
              {meta.tonnage && <InfoItem label="Tonnage" value={`${meta.tonnage.toLocaleString()} GT`} />}
            </div>
            <p className="text-sm text-muted-foreground">
              Part of the{' '}
              <Link href={`/cruise-lines/${ship.cruiseLine.slug}`} className="font-medium text-[#C59746] hover:underline">
                {ship.cruiseLine.name}
              </Link>{' '}
              fleet.
            </p>
          </div>
          <div className="lg:col-span-2">
            <ShipGallery images={images.images} />
          </div>
        </div>
      </div>
    </>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  )
}
