import type { Metadata } from 'next'
import { fetchDestinations } from '@/lib/fetchers/destinations'
import { DestinationGallery } from '@/components/destinations/destination-gallery'

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
  const { search, type } = await searchParams
  // Always fetch page 1 for SSR — infinite scroll handles the rest client-side
  const PAGE_SIZE = 24
  let data: Awaited<ReturnType<typeof fetchDestinations>> = { destinations: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 }
  try {
    data = await fetchDestinations({
      search,
      type: type || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    })
  } catch (err: any) {
    console.error('Destinations fetch failed:', err?.message)
  }

  return (
    <div>
      {/* Hero banner */}
      <div className="relative h-64 overflow-hidden bg-[#1A1A1A]">
        <img
          src="/images/destinations/default.jpg"
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
        <DestinationGallery
          initialDestinations={data.destinations}
          initialPage={data.page}
          totalPages={data.totalPages}
          search={search}
          type={type}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  )
}
