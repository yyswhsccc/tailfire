import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchRegionBySlug } from '@/lib/fetchers/regions'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { PageContextBridge } from '@/components/page-context-bridge'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const region = await fetchRegionBySlug(slug)
    return {
      title: region.name,
      description: `Explore ${region.name} — ${region.sailingCount.toLocaleString()} cruises.`,
    }
  } catch {
    return { title: 'Region Not Found' }
  }
}

export default async function RegionHubPage({ params }: Props) {
  const { slug } = await params
  let region
  try { region = await fetchRegionBySlug(slug) } catch { notFound() }

  return (
    <>
      <PageContextBridge type="region" slug={slug} name={region.name} />

      <HubHero title={region.name} badge="Cruise Region">
        <HubHeroMeta items={[
          { label: `🚢 ${region.sailingCount.toLocaleString()} sailings` },
          { label: `📍 ${region.destinations.length} ports` },
        ]} />
        <HubHeroCta
          primaryLabel={`Explore the ${region.name}`}
          primaryPrompt={`Tell me about cruising in the ${region.name}`}
          entityType="region"
          entitySlug={slug}
          entityName={region.name}
        />
      </HubHero>

      <HubContext
        description={region.description}
        pills={[
          { emoji: '🚢', label: `${region.sailingCount.toLocaleString()} sailings available` },
          { emoji: '📍', label: `${region.destinations.length} destinations` },
        ]}
      />

      {region.destinations.length > 0 && (
        <FeedSection title={`📍 Destinations in the ${region.name}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {region.destinations.map((dest, i) => (
              <div key={i} className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">{dest.name}</p>
                {dest.country && <p className="mt-0.5 text-xs text-[#888]">{dest.country}</p>}
              </div>
            ))}
          </div>
        </FeedSection>
      )}
    </>
  )
}
