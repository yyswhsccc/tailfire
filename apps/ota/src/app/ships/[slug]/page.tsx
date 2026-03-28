import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchShipBySlug, fetchShipImages, fetchShipSailings } from '@/lib/fetchers/ships'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ShipGallery } from '@/components/ships/ship-gallery'
import { CruiseCard } from '@/components/hub/cards/cruise-card'
import type { ShipImage } from '@/types/entities'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const ship = await fetchShipBySlug(slug)
    return { title: `${ship.name} — ${ship.cruiseLine.name}`, description: `Explore ${ship.name}. ${ship.upcomingSailingCount} upcoming sailings.` }
  } catch { return { title: 'Ship Not Found' } }
}

export default async function ShipHubPage({ params }: Props) {
  const { slug } = await params
  let ship
  try { ship = await fetchShipBySlug(slug) } catch { notFound() }

  let images: { images: ShipImage[] } = { images: [] }
  try { images = await fetchShipImages(ship.id, 1, 12) } catch {}

  let shipSailings = { sailings: [] as any[], total: 0 }
  try { shipSailings = await fetchShipSailings(ship.id, 4) } catch {}

  const metaItems: Array<{ label: string }> = []
  if (ship.passengerCapacity) metaItems.push({ label: `👥 ${ship.passengerCapacity.toLocaleString()} guests` })
  metaItems.push({ label: `📅 ${ship.upcomingSailingCount} sailings` })
  if (ship.tonnage) metaItems.push({ label: `⚓ ${Math.round(ship.tonnage / 1000)}K GT` })

  const pills: Array<{ emoji: string; label: string }> = []
  if (ship.yearBuilt) pills.push({ emoji: '🏗️', label: `Built ${ship.yearBuilt}` })
  if (ship.shipClass) pills.push({ emoji: '🚢', label: `${ship.shipClass} Class` })
  if (ship.crewCount) pills.push({ emoji: '👨‍✈️', label: `${ship.crewCount.toLocaleString()} crew` })
  if (ship.tonnage) pills.push({ emoji: '⚓', label: `${ship.tonnage.toLocaleString()} GT` })

  return (
    <>
      <PageContextBridge type="ship" slug={slug} name={ship.name}
        parentContext={{ type: 'cruise_line', slug: ship.cruiseLine.slug, name: ship.cruiseLine.name }} />

      <HubHero title={ship.name} badge={ship.cruiseLine.name} imageUrl={ship.imageUrl}>
        <HubHeroMeta items={metaItems} />
        <HubHeroCta
          primaryLabel={`Explore Sailings on ${ship.name}`}
          primaryPrompt={`Tell me about the ${ship.name}`}
          entityType="ship" entitySlug={slug} entityName={ship.name}
        />
      </HubHero>

      <HubContext description={null} pills={pills.length > 0 ? pills : undefined} />

      <div className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-10 lg:px-[60px]">
        <p className="text-sm text-[#888]">
          Part of the{' '}
          <Link href={`/cruise-lines/${ship.cruiseLine.slug}`} className="font-medium text-[#C59746] hover:underline">
            {ship.cruiseLine.name}
          </Link>{' '}
          fleet.
        </p>
      </div>

      <FeedDivider />

      {images.images.length > 0 && (
        <FeedSection title="📸 Ship Gallery">
          <ShipGallery images={images.images} />
        </FeedSection>
      )}

      {shipSailings.sailings.length > 0 && (
        <>
          <FeedSection
            title={`🚢 Upcoming Sailings on ${ship.name}`}
            subtitle={`${shipSailings.total} sailings available`}
            viewAllHref={`/search/cruises?q=${encodeURIComponent(ship.name)}`}
            viewAllLabel="Search all sailings →"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {shipSailings.sailings.map((s) => (
                <CruiseCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  shipName={s.shipName}
                  shipImageUrl={s.shipImageUrl}
                  cruiseLineName={s.cruiseLineName}
                  sailDate={s.sailDate}
                  nights={s.nights}
                  cheapestPriceCents={s.cheapestInsideCents}
                />
              ))}
            </div>
          </FeedSection>
          <FeedDivider />
        </>
      )}
    </>
  )
}
