import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchDestinationBySlug, fetchDestinationCruises } from '@/lib/fetchers/destinations'
import { PageContextBridge } from '@/components/page-context-bridge'
import { formatPrice } from '@/lib/format'

export const revalidate = 1800

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: `Cruises to ${dest.name}`,
      description: `Browse ${dest.stats.cruiseCount} cruises stopping at ${dest.name}.`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationCruisesPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const page = pageParam ? parseInt(pageParam) : 1

  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  let data: Awaited<ReturnType<typeof fetchDestinationCruises>> = { destination: { id: '', name: '', slug }, sailings: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  try { data = await fetchDestinationCruises(slug, page, 20) } catch { /* API unavailable at build time */ }

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">
            <Link href={`/destinations/${slug}`} className="text-[#C59746] hover:underline">{destination.name}</Link> › Cruises
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-[#1A1A1A] md:text-3xl">
            Cruises Visiting {destination.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} sailing{data.total !== 1 ? 's' : ''} found
          </p>
        </div>

        <div className="space-y-4">
          {data.sailings.map((s) => (
            <Link key={s.id} href={`/cruises/${s.id}`} className="block rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[#C59746]">{s.cruiseLineName}</p>
                  <p className="text-base font-semibold text-[#1A1A1A]">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {s.shipName} · {s.nights} nights · {new Date(s.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {s.cheapestInsideCents != null && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">from</p>
                    <p className="text-xl font-bold text-[#C59746]">{formatPrice(s.cheapestInsideCents)}</p>
                    <p className="text-xs text-muted-foreground">/person</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {data.totalPages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: Math.min(data.totalPages, 10) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/destinations/${slug}/cruises?page=${p}`}
                className={`inline-flex size-10 items-center justify-center rounded-lg text-sm font-medium ${
                  p === data.page ? 'bg-[#C59746] text-white' : 'border border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
