// apps/ota/src/components/hub/sections/deck-plans-section.tsx

import Image from 'next/image'
import { FeedSection } from '@/components/hub/feed-section'
import { fetchShipDecks } from '@/lib/fetchers/ships'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

interface Deck {
  name: string
  deckNumber: number | null
  deckPlanUrl: string | null
  description: string | null
}

function DeckCard({ deck }: { deck: Deck }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E0E0E0] bg-white shadow-sm">
      {deck.deckPlanUrl ? (
        <div className="relative h-40 w-full overflow-hidden bg-[#f5f5f5]">
          <Image
            src={deck.deckPlanUrl}
            alt={`${deck.name} deck plan`}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center bg-[#f5f5f5]">
          <span className="text-3xl text-[#ccc]">🚢</span>
        </div>
      )}
      <div className="p-3">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold text-[#1A1A1A]">{deck.name}</p>
          {deck.deckNumber != null && (
            <span className="rounded bg-[#f0f0f0] px-1.5 py-0.5 text-[10px] font-medium text-[#888]">
              Deck {deck.deckNumber}
            </span>
          )}
        </div>
        {deck.description && (
          <p className="mt-1 line-clamp-2 text-xs text-[#888]">{deck.description}</p>
        )}
      </div>
    </div>
  )
}

export async function DeckPlansSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  if (entityType !== 'ship') return null

  // Ship adapter passes shipId (UUID) in sectionProps; fall back to entitySlug for compat
  const shipId = (sectionProps.shipId as string) || entitySlug

  let decks: Deck[] = []

  try {
    decks = await fetchShipDecks(shipId)
  } catch {
    return null
  }

  if (!decks || decks.length === 0) return null

  // Sort by deck number ascending if available
  const sorted = [...decks].sort((a, b) => {
    if (a.deckNumber != null && b.deckNumber != null) return a.deckNumber - b.deckNumber
    if (a.deckNumber != null) return -1
    if (b.deckNumber != null) return 1
    return a.name.localeCompare(b.name)
  })

  const resolvedSubtitle = subtitle ?? `${sorted.length} deck${sorted.length !== 1 ? 's' : ''}`

  return (
    <FeedSection
      title={title}
      subtitle={resolvedSubtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((deck) => (
          <DeckCard key={deck.name} deck={deck} />
        ))}
      </div>
    </FeedSection>
  )
}
