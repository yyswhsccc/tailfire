import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchDestinations } from '@/lib/fetchers/destinations'
import { DestinationCard } from '@/components/destinations/destination-card'

// Force dynamic rendering — destinations data changes and API may not be available at build time
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Destinations',
  description: 'Explore travel destinations worldwide. Discover things to do, find cruises, tours, hotels, and plan your perfect trip.',
}

interface DestinationsPageProps {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>
}

export default async function DestinationsPage({ searchParams }: DestinationsPageProps) {
  const { search, type, page } = await searchParams
  // Show all destination types by default — this is travel discovery, not a cruise port directory
  let data: Awaited<ReturnType<typeof fetchDestinations>> = { destinations: [], total: 0, page: 1, pageSize: 24, totalPages: 0 }
  try {
    data = await fetchDestinations({
      search,
      type: type || undefined,
      page: page ? parseInt(page) : 1,
      pageSize: 24,
    })
  } catch (err: any) {
    console.error('Destinations fetch failed:', err?.message)
  }

  return (
    <div>
      {/* Hero banner */}
      <div className="relative h-64 overflow-hidden bg-[#1A1A1A]">
        <img
          src="https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&h=500&fit=crop"
          alt="Explore destinations"
          className="h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-transparent to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
            EXPLORE THE WORLD
          </h1>
          <p className="mt-3 text-lg text-white/80">
            {data.total.toLocaleString()} destinations to discover
          </p>
          {/* Search inside hero */}
          <form className="mt-6 flex w-full max-w-lg gap-2">
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Where do you want to go?"
              className="h-12 flex-1 rounded-xl border-0 bg-white/95 px-5 text-sm text-[#1A1A1A] shadow-lg outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-[#C59746]"
            />
            <button
              type="submit"
              className="h-12 rounded-xl bg-[#C59746] px-8 text-sm font-bold text-white shadow-lg hover:bg-[#B08638] transition-colors"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {data.destinations.length > 0 ? (
        <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {data.destinations.map((dest) => (
            <DestinationCard key={dest.id} destination={dest} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium text-[#1A1A1A]">No destinations found</p>
          <p className="mt-2 text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: Math.min(data.totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/destinations?${new URLSearchParams({ ...(search ? { search } : {}), page: String(p) }).toString()}`}
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
    </div>
  )
}
