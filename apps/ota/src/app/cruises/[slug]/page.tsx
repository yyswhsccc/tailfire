import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchSailingById } from '@/lib/fetchers/sailings'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { CtaBar } from '@/components/entity/cta-bar'
import { ItineraryTimeline } from '@/components/cruises/itinerary-timeline'
import { CabinPriceGrid } from '@/components/cruises/cabin-price-grid'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Calendar, Moon, Ship } from 'lucide-react'

export const revalidate = 1800

interface SailingPageProps {
  params: Promise<{ slug: string }>
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export async function generateMetadata({ params }: SailingPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const sailing = await fetchSailingById(slug)
    return {
      title: `${sailing.name} — ${sailing.ship.name}`,
      description: `${sailing.nights}-night ${sailing.name} on ${sailing.ship.name} departing ${formatDate(sailing.sailDate)}.`,
    }
  } catch {
    return { title: 'Sailing Not Found' }
  }
}

export default async function SailingDetailPage({ params }: SailingPageProps) {
  const { slug } = await params
  let sailing
  try {
    sailing = await fetchSailingById(slug)
  } catch {
    notFound()
  }

  return (
    <>
      <PageContextBridge
        type="sailing"
        slug={slug}
        name={sailing.name}
        parentContext={{ type: 'ship', slug: sailing.ship.slug, name: sailing.ship.name }}
      />

      <EntityHero
        title={sailing.name}
        badge={sailing.cruiseLine.name}
        imageUrl={sailing.ship.imageUrl}
        subtitle={`${formatDate(sailing.sailDate)} — ${formatDate(sailing.endDate)}`}
      >
        <div className="flex flex-wrap gap-3">
          <StatCard label="nights" value={sailing.nights} icon={<Moon className="size-3.5" />} />
          <StatCard label="" value={sailing.ship.name} icon={<Ship className="size-3.5" />} />
        </div>
        <div className="mt-4">
          <CtaBar
            entityType="sailing"
            entitySlug={slug}
            entityName={sailing.name}
            inquirePrompt={`I'm interested in the ${sailing.name} on ${sailing.ship.name} departing ${formatDate(sailing.sailDate)}`}
          />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-6 text-xl font-bold text-[#1A1A1A]">Day-by-Day Itinerary</h2>
            <ItineraryTimeline stops={sailing.itinerary} />
          </div>

          <div>
            <Link
              href={`/ships/${sailing.ship.slug}`}
              className="mb-6 block overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {sailing.ship.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img src={sailing.ship.imageUrl} alt={sailing.ship.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{sailing.cruiseLine.name}</p>
                <p className="text-base font-semibold text-[#1A1A1A]">{sailing.ship.name}</p>
              </div>
            </Link>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Departs</p>
                  <p className="font-medium text-[#1A1A1A]">{sailing.embarkPort.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Returns</p>
                  <p className="font-medium text-[#1A1A1A]">{sailing.disembarkPort.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Cabin Pricing</h2>
          <CabinPriceGrid prices={sailing.prices} />
          <p className="mt-3 text-xs text-muted-foreground">
            Prices per person in CAD. Subject to availability. Contact an advisor for the best rate.
          </p>
        </div>
      </div>
    </>
  )
}
