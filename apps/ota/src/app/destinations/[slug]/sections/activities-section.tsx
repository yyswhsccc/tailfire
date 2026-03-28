import { FeedSection } from '@/components/hub/feed-section'
import { ActivityCard } from '@/components/hub/cards/activity-card'
import type { DestinationDetail } from '@/types/entities'

interface Props {
  destinationName: string
  enrichment: DestinationDetail['enrichment']
}

export function ActivitiesSection({ destinationName, enrichment }: Props) {
  const activities = enrichment?.topAttractions || []
  if (activities.length === 0) return null

  return (
    <FeedSection title={`\uD83C\uDFAF Things to Do in ${destinationName}`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {activities.slice(0, 8).map((activity, i) => (
          <ActivityCard
            key={i}
            title={activity.title}
            rating={activity.rating}
            description={activity.description}
          />
        ))}
      </div>
    </FeedSection>
  )
}
