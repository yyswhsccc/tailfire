'use client'

/**
 * Unsplash Picker Component
 *
 * Allows users to search and select stock photos from Unsplash.
 * Displays attribution as required by Unsplash guidelines.
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'

// Unsplash photo types
interface UnsplashPhoto {
  id: string
  description: string | null
  altDescription: string | null
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  user: {
    name: string
    username: string
    links: {
      html: string
    }
  }
  links: {
    html: string
    download_location: string
  }
  width: number
  height: number
}

interface UnsplashSearchResponse {
  total: number
  totalPages: number
  results: UnsplashPhoto[]
}

interface UnsplashPickerProps {
  /** Callback when a photo is selected */
  onSelect: (photo: UnsplashPhoto) => void
  /** Whether a selection is being processed (disables further selections) */
  isSelecting?: boolean
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function UnsplashPicker({
  onSelect,
  isSelecting = false,
}: UnsplashPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  // Debounce search query (300ms)
  const debouncedQuery = useDebounce(searchQuery, 300)

  // Reset page when query changes
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  // Fetch search results
  const {
    data: searchResults,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['unsplash-search', debouncedQuery, page],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return null
      }

      const params = new URLSearchParams({
        query: debouncedQuery.trim(),
        page: String(page),
        perPage: '20',
      })

      return api.get<UnsplashSearchResponse>(`/unsplash/search?${params.toString()}`)
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes (matches server cache)
  })

  // Handle photo selection
  const handleSelect = useCallback(
    (photo: UnsplashPhoto) => {
      if (!isSelecting) {
        onSelect(photo)
      }
    },
    [onSelect, isSelecting]
  )

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash-400" />
        <Input
          type="text"
          placeholder="Search for photos (e.g., beach, mountains, city)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          disabled={isSelecting}
        />
        {(isLoading || isFetching) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ash-400" />
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error instanceof ApiError
            ? error.message
            : 'Failed to search photos. Please try again.'}
        </div>
      )}

      {/* Results */}
      {!debouncedQuery.trim() ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <ImageIcon className="h-12 w-12 text-ash-300" />
          <p className="mt-2 text-sm text-ash-500">
            Search for free stock photos from Unsplash
          </p>
          <p className="text-xs text-ash-400">
            Try: beach, mountains, travel, city, nature
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-ash-400" />
        </div>
      ) : searchResults && searchResults.results.length > 0 ? (
        <>
          {/* Photo grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {searchResults.results.map((photo, index) => (
              <button
                key={`${photo.id}-${index}`}
                type="button"
                onClick={() => handleSelect(photo)}
                disabled={isSelecting}
                className={`
                  group relative aspect-[4/3] overflow-hidden rounded-lg border border-ash-200
                  transition-all hover:border-blue-400 hover:shadow-md
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${isSelecting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                `}
              >
                <img
                  src={photo.urls.small}
                  alt={photo.altDescription || photo.description || 'Unsplash photo'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />

                {/* Hover overlay with attribution */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="p-2">
                    <p className="text-xs text-white">
                      Photo by{' '}
                      <a
                        href={`${photo.user.links.html}?utm_source=tailfire&utm_medium=referral`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="underline hover:text-blue-300"
                      >
                        {photo.user.name}
                      </a>
                    </p>
                  </div>
                </div>

                {/* Selection indicator */}
                {isSelecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Pagination */}
          {searchResults.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-ash-500">
                Page {page} of {searchResults.totalPages} ({searchResults.total} results)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isSelecting}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= searchResults.totalPages || isSelecting}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Unsplash attribution */}
          <p className="text-center text-xs text-ash-400">
            Photos provided by{' '}
            <a
              href="https://unsplash.com/?utm_source=tailfire&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ash-600"
            >
              Unsplash
            </a>
          </p>
        </>
      ) : searchResults ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <ImageIcon className="h-12 w-12 text-ash-300" />
          <p className="mt-2 text-sm text-ash-500">
            No photos found for &ldquo;{debouncedQuery}&rdquo;
          </p>
          <p className="text-xs text-ash-400">Try different keywords</p>
        </div>
      ) : null}
    </div>
  )
}
