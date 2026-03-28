import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { fetchDestinationBySlug, fetchDestinationCruises } from '@/lib/fetchers/destinations'
import { DestinationHero } from '@/components/destinations/destination-hero'
import { CtaBar } from '@/components/entity/cta-bar'
import { PageContextBridge } from '@/components/page-context-bridge'
import { formatPrice } from '@/lib/format'

export const revalidate = 3600

interface DestinationPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: DestinationPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description: dest.enrichment?.summary || dest.summary || `Explore ${dest.name} — cruises, tours, and things to do.`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationDetailPage({ params }: DestinationPageProps) {
  const { slug } = await params
  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  let cruises = { sailings: [] as any[], total: 0 }
  try {
    cruises = await fetchDestinationCruises(slug, 1, 6)
  } catch { /* cruises optional */ }

  const enrichment = destination.enrichment
  const description = enrichment?.summary || destination.summary

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <DestinationHero destination={destination} />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <CtaBar
            entityType="destination"
            entitySlug={slug}
            entityName={destination.name}
            inquirePrompt={`Help me plan a trip to ${destination.name}`}
          />
        </div>

        {description && (
          <div className="mb-10">
            <h2 className="mb-3 text-xl font-bold text-[#1A1A1A]">About {destination.name}</h2>
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{description}</p>
          </div>
        )}

        {enrichment?.topAttractions && enrichment.topAttractions.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Things to Do</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enrichment.topAttractions.slice(0, 6).map((attraction, i) => (
                <div key={i} className="rounded-xl border border-border bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#1A1A1A]">{attraction.title}</h3>
                  {attraction.rating > 0 && (
                    <p className="mt-1 text-xs text-[#C59746]">{'\u2605'.repeat(Math.round(attraction.rating))} {attraction.rating.toFixed(1)}</p>
                  )}
                  {attraction.description && (
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{attraction.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {enrichment?.photos && enrichment.photos.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Photos</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {enrichment.photos.slice(0, 8).map((photo, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                  <Image src={photo.url} alt={photo.caption || destination.name} fill className="object-cover" sizes="25vw" />
                </div>
              ))}
            </div>
          </div>
        )}

        {cruises.total > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#1A1A1A]">Cruises Visiting {destination.name}</h2>
              {cruises.total > 3 && (
                <Link href={`/destinations/${slug}/cruises`} className="text-sm font-medium text-[#C59746] hover:underline">
                  View all {cruises.total} →
                </Link>
              )}
            </div>
            <div className="space-y-4">
              {cruises.sailings.slice(0, 3).map((s: any) => (
                <Link key={s.id} href={`/cruises/${s.id}`} className="block">
                  <div className="rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{s.cruiseLineName}</p>
                        <p className="text-sm font-semibold text-[#1A1A1A]">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.shipName} · {s.nights} nights · {new Date(s.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      {s.cheapestInsideCents && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">from</p>
                          <p className="text-lg font-bold text-[#C59746]">{formatPrice(s.cheapestInsideCents)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
