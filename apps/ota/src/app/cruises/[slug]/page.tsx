import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchSailingById } from '@/lib/fetchers/sailings'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { sailingAdapter } from '@/lib/entity-hubs/adapters/sailing.adapter'
import { ItineraryTimeline } from '@/components/cruises/itinerary-timeline'

export const revalidate = 1800

interface Props {
  params: Promise<{ slug: string }>
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const s = await fetchSailingById(slug)
    return {
      title: `${s.name} — ${s.ship.name}`,
      description: `${s.nights}-night ${s.name} on ${s.ship.name} departing ${fmtDate(s.sailDate)}.`,
    }
  } catch {
    return { title: 'Sailing Not Found' }
  }
}

export default async function SailingHubPage({ params }: Props) {
  const { slug } = await params

  let sailing
  try {
    sailing = await fetchSailingById(slug)
  } catch {
    notFound()
  }

  return (
    <HubScaffold
      hero={sailingAdapter.heroData(sailing)}
      contextPills={sailingAdapter.contextPills(sailing)}
      sections={sailingAdapter.sections(sailing)}
      aiContext={sailingAdapter.aiContext(sailing)}
      entityType="sailing"
      entitySlug={slug}
      parentContext={{
        type: 'ship',
        slug: sailing.ship.slug,
        name: sailing.ship.name,
      }}
    >
      {/* Itinerary + Ship sidebar — sailing-specific, rendered inline below scaffold sections */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          {/* Left: Day-by-day itinerary */}
          <div>
            <h2 className="mb-6 text-lg font-bold text-[#1A1A1A] sm:text-xl">
              📍 Day-by-Day Itinerary
            </h2>
            <ItineraryTimeline stops={sailing.itinerary} />
          </div>

          {/* Right: Ship card */}
          <div>
            <Link
              href={`/ships/${sailing.ship.slug}`}
              className="mb-4 block overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {sailing.ship.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img
                    src={sailing.ship.imageUrl}
                    alt={sailing.ship.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <p className="text-xs text-[#888]">{sailing.cruiseLine.name}</p>
                <p className="text-base font-semibold text-[#1A1A1A]">{sailing.ship.name}</p>
                <p className="mt-1 text-xs text-[#C59746]">View ship details →</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </HubScaffold>
  )
}
