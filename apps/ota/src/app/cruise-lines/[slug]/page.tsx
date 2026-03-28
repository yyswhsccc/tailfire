import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchCruiseLineBySlug } from '@/lib/fetchers/cruise-lines'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ShipCard } from '@/components/ships/ship-card'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const line = await fetchCruiseLineBySlug(slug)
    return { title: line.name, description: `Explore ${line.name} — ${line.shipCount} ships, ${line.sailingCount.toLocaleString()} sailings.` }
  } catch { return { title: 'Cruise Line Not Found' } }
}

export default async function CruiseLineHubPage({ params }: Props) {
  const { slug } = await params
  let line
  try { line = await fetchCruiseLineBySlug(slug) } catch { notFound() }

  const heroImage = line.ships[0]?.imageUrl || null

  return (
    <>
      <PageContextBridge type="cruise_line" slug={slug} name={line.name} />

      <HubHero title={line.name} badge="Cruise Line" imageUrl={heroImage}>
        <HubHeroMeta items={[
          { label: `🚢 ${line.shipCount} ships` },
          { label: `📅 ${line.sailingCount.toLocaleString()} sailings` },
        ]} />
        <HubHeroCta
          primaryLabel={`Explore ${line.name}`}
          primaryPrompt={`Tell me about ${line.name} cruises`}
          entityType="cruise_line" entitySlug={slug} entityName={line.name}
        />
      </HubHero>

      <HubContext description={null} pills={[
        { emoji: '🚢', label: `${line.shipCount} ships in fleet` },
        { emoji: '📅', label: `${line.sailingCount.toLocaleString()} sailings` },
      ]} />

      <FeedSection title={`🚢 ${line.name} Fleet`}>
        {line.ships.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {line.ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-[#888]">No ships listed yet.</p>
        )}
      </FeedSection>
    </>
  )
}
