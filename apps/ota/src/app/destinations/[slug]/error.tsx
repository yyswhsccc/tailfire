'use client'

import Link from 'next/link'

export default function DestinationError({ error: _error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-4xl">🌍</p>
      <h2 className="mt-4 text-xl font-bold text-[#1A1A1A]">Something went wrong</h2>
      <p className="mt-2 text-sm text-[#888]">We couldn&apos;t load this destination. Please try again.</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#C59746] px-4 py-2 text-sm font-medium text-white hover:bg-[#B08638]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-[#E0E0E0] px-4 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#faf6f0]"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}
