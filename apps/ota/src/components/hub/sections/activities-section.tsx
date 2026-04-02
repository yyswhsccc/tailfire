// apps/ota/src/components/hub/sections/activities-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function ActivitiesSection({
  title,
  subtitle,
  sectionProps,
}: SectionComponentProps) {
  const activities = (sectionProps.activities as any[]) ?? []
  if (activities.length === 0) return null

  return (
    <FeedSection title={title} subtitle={subtitle}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activities.slice(0, 6).map((a: any, i: number) => (
          <div key={i} className="rounded-xl border border-[#f0f0f0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">{a.name}</h3>
            {a.category && <p className="mt-1 text-xs text-[#888]">{a.category}</p>}
            {a.rating != null && (
              <p className="mt-1 text-xs text-[#C59746]">⭐ {a.rating.toFixed(1)}</p>
            )}
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
