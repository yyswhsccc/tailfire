import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchSailingById } from '@/lib/fetchers/sailings'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ItineraryTimeline } from '@/components/cruises/itinerary-timeline'
import { CabinPriceGrid } from '@/components/cruises/cabin-price-grid'
import { formatPrice } from '@/lib/format'

export const revalidate = 1800

interface Props { params: Promise<{ slug: string }> }

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const s = await fetchSailingById(slug)
    return { title: `${s.name} — ${s.ship.name}`, description: `${s.nights}-night ${s.name} on ${s.ship.name} departing ${fmtDate(s.sailDate)}.` }
  } catch { return { title: 'Sailing Not Found' } }
}

export default async function SailingHubPage({ params }: Props) {
  const { slug } = await params
  let sailing
  try { sailing = await fetchSailingById(slug) } catch { notFound() }

  const cheapest = [sailing.prices.inside, sailing.prices.oceanview, sailing.prices.balcony, sailing.prices.suite]
    .filter((p): p is number => p != null)
  const lowestPrice = cheapest.length > 0 ? Math.min(...cheapest) : null
  const seaDays = sailing.itinerary.filter((s) => s.isSeaDay).length

  return (
    <>
      <PageContextBridge type="sailing" slug={slug} name={sailing.name}
        parentContext={{ type: 'ship', slug: sailing.ship.slug, name: sailing.ship.name }} />

      <HubHero
        title={sailing.name}
        badge={`${sailing.cruiseLine.name} · ${sailing.ship.name}`}
        subtitle={`${fmtDate(sailing.sailDate)} — ${fmtDate(sailing.endDate)}`}
        imageUrl={sailing.ship.imageUrl}
      >
        <HubHeroMeta items={[
          { label: `🌙 ${sailing.nights} nights` },
          { label: `🚢 ${sailing.ship.name}` },
          ...(lowestPrice ? [{ label: `From ${formatPrice(lowestPrice)}/person` }] : []),
        ]} />
        <HubHeroCta
          primaryLabel="Inquire About This Sailing"
          primaryPrompt={`I'm interested in the ${sailing.name} on ${sailing.ship.name} departing ${fmtDate(sailing.sailDate)}`}
          entityType="sailing" entitySlug={slug} entityName={sailing.name}
        />
      </HubHero>

      <HubContext description={null} pills={[
        { emoji: '🚢', label: `Departs ${sailing.embarkPort.name}` },
        { emoji: '🏁', label: `Returns ${sailing.disembarkPort.name}` },
        ...(seaDays > 0 ? [{ emoji: '🌊', label: `${seaDays} sea day${seaDays > 1 ? 's' : ''}` }] : []),
      ]} />

      {/* Itinerary + Ship/Pricing sidebar */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          {/* Left: Itinerary */}
          <div>
            <h2 className="mb-6 text-lg font-bold text-[#1A1A1A] sm:text-xl">📍 Day-by-Day Itinerary</h2>
            <ItineraryTimeline stops={sailing.itinerary} />
          </div>

          {/* Right: Ship card + Pricing */}
          <div>
            <Link
              href={`/ships/${sailing.ship.slug}`}
              className="mb-4 block overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {sailing.ship.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img src={sailing.ship.imageUrl} alt={sailing.ship.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <p className="text-xs text-[#888]">{sailing.cruiseLine.name}</p>
                <p className="text-base font-semibold text-[#1A1A1A]">{sailing.ship.name}</p>
                <p className="mt-1 text-xs text-[#C59746]">View ship details →</p>
              </div>
            </Link>

            <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5">
              <h3 className="mb-4 text-sm font-bold text-[#1A1A1A]">Cabin Pricing</h3>
              <CabinPriceGrid prices={sailing.prices} />
              <p className="mt-3 text-[11px] text-[#aaa]">Per person in CAD · Subject to availability</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
