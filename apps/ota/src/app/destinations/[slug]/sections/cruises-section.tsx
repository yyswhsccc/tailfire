import { FeedSection } from '@/components/hub/feed-section'
import { CruiseCard } from '@/components/hub/cards/cruise-card'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'

interface Props {
  slug: string
  destinationName: string
}

export async function CruisesSection({ slug, destinationName }: Props) {
  let data
  try {
    data = await fetchDestinationCruises(slug, 1, 4)
  } catch {
    return null
  }
  if (data.sailings.length === 0) return null

  return (
    <FeedSection
      title={`\uD83D\uDEA2 Cruises Visiting ${destinationName}`}
      subtitle={`${data.total} sailings stopping here`}
      viewAllHref={`/destinations/${slug}/cruises`}
      viewAllLabel={`View all ${data.total} \u2192`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {data.sailings.slice(0, 4).map((s) => (
          <CruiseCard
            key={s.id}
            id={s.id}
            name={s.name}
            shipName={s.shipName}
            shipImageUrl={s.shipImageUrl}
            cruiseLineName={s.cruiseLineName}
            sailDate={s.sailDate}
            nights={s.nights}
            cheapestPriceCents={s.cheapestInsideCents}
          />
        ))}
      </div>
    </FeedSection>
  )
}
