'use client'

import Image from 'next/image'
import { openChat } from '@/components/chat/chat-widget'
import { getCuratedImage } from '@/lib/curated-images'
import type { AdvisorProfile } from '@/types/advisor'

interface AdvisorStorefrontHeroProps {
  advisor: AdvisorProfile
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function getAverageRating(reviews?: { rating: number }[]): { avg: number; count: number } | null {
  if (!reviews || reviews.length === 0) return null
  const total = reviews.reduce((sum, r) => sum + r.rating, 0)
  return { avg: total / reviews.length, count: reviews.length }
}

export function AdvisorStorefrontHero({ advisor }: AdvisorStorefrontHeroProps) {
  const firstName = advisor.displayName.split(' ')[0]
  const rating = getAverageRating(advisor.reviews)
  const topDestination = advisor.destinations?.[0] || 'travel'
  const heroImage = getCuratedImage(topDestination, 'default', 'hero')

  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {/* Background image — advisor's top destination */}
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

      <div className="relative mx-auto max-w-[1280px] px-4 pb-10 pt-20 text-center sm:px-10 sm:pb-12 sm:pt-24 lg:px-[60px]">
        {/* Agent Photo */}
        {advisor.photoUrl ? (
          <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full border-[3px] border-white shadow-lg sm:h-28 sm:w-28">
            <Image
              src={advisor.photoUrl}
              alt={advisor.displayName}
              fill
              className="object-cover"
              sizes="112px"
              priority
            />
          </div>
        ) : (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#C59746] to-[#E89E4A] shadow-lg sm:h-28 sm:w-28">
            <span className="text-2xl font-bold text-white sm:text-3xl">{getInitials(advisor.displayName)}</span>
          </div>
        )}

        {/* Name + Title */}
        <h1 className="mt-5 font-display text-2xl font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-3xl lg:text-4xl">
          {advisor.displayName}
        </h1>
        {advisor.title && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[2px] text-[#C59746] [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
            {advisor.title}
          </p>
        )}

        {/* Rating */}
        {rating && (
          <p className="mt-2 text-sm text-white/80">
            ⭐ {rating.avg.toFixed(1)} · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
          </p>
        )}

        {/* CTAs */}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => openChat(`I'm on ${firstName}'s page — help me plan a trip!`)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C59746] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#B08638]"
          >
            ✨ Start Planning
          </button>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            📞 Contact {firstName}
          </a>
        </div>
      </div>
    </div>
  )
}
