import type { Metadata } from 'next'
import { fetchDestinations } from '@/lib/fetchers/destinations'
import { DestinationCard } from '@/components/destinations/destination-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Destinations',
  description: 'Explore cruise destinations worldwide. Browse ports of call, discover things to do, and plan your perfect cruise.',
}

interface DestinationsPageProps {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>
}

export default async function DestinationsPage({ searchParams }: DestinationsPageProps) {
  const { search, type, page } = await searchParams
  const data = await fetchDestinations({
    search,
    type: type || 'port_city',
    page: page ? parseInt(page) : 1,
    pageSize: 24,
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          DESTINATIONS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {data.total.toLocaleString()} cruise destinations worldwide
        </p>
      </div>

      <form className="mb-8 flex max-w-lg gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search destinations..."
          className="h-10 flex-1 rounded-lg border border-border bg-white px-4 text-sm outline-none focus:border-[#C59746] focus:ring-1 focus:ring-[#C59746]"
        />
        <button
          type="submit"
          className="h-10 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white hover:bg-[#B08638]"
        >
          Search
        </button>
      </form>

      {data.destinations.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
            <a
              key={p}
              href={`/destinations?${new URLSearchParams({ ...(search ? { search } : {}), page: String(p) }).toString()}`}
              className={`inline-flex size-10 items-center justify-center rounded-lg text-sm font-medium ${
                p === data.page ? 'bg-[#C59746] text-white' : 'border border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
