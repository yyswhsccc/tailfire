'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DestinationSummary } from '@/types/entities'
import { DestinationCard } from './destination-card'

interface DestinationGalleryProps {
  initialDestinations: DestinationSummary[]
  initialPage: number
  totalPages: number
  search?: string
  type?: string
  pageSize: number
}

export function DestinationGallery({
  initialDestinations,
  initialPage,
  totalPages,
  search,
  type,
  pageSize,
}: DestinationGalleryProps) {
  const [destinations, setDestinations] = useState<DestinationSummary[]>(initialDestinations)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialPage < totalPages)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset state when search/type/initial data changes (new server render)
  useEffect(() => {
    setDestinations(initialDestinations)
    setPage(initialPage)
    setHasMore(initialPage < totalPages)
  }, [initialDestinations, initialPage, totalPages])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const nextPage = page + 1
    try {
      const params = new URLSearchParams()
      params.set('page', String(nextPage))
      params.set('pageSize', String(pageSize))
      if (search) params.set('search', search)
      if (type) params.set('type', type)

      const res = await fetch(`/api/destinations?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json() as {
        destinations: DestinationSummary[]
        totalPages: number
      }

      setDestinations((prev) => [...prev, ...data.destinations])
      setPage(nextPage)
      setHasMore(nextPage < data.totalPages)
    } catch {
      // Silently fail — user can scroll again to retry
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, page, pageSize, search, type])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  if (destinations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No destinations found</p>
        <p className="mt-2 text-sm text-muted-foreground">Try a different search term.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {destinations.map((dest) => (
          <DestinationCard key={dest.id} destination={dest} />
        ))}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="mt-4 flex justify-center py-8">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg
              className="h-5 w-5 animate-spin text-[#C59746]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading more destinations...
          </div>
        )}
        {!hasMore && destinations.length > 0 && (
          <p className="text-sm text-muted-foreground">All destinations loaded</p>
        )}
      </div>
    </>
  )
}
