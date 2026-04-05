import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchDestinationBySlug, fetchDestinationCruises } from '@/lib/fetchers/destinations'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { destinationAdapter } from '@/lib/entity-hubs/adapters/destination.adapter'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description:
        dest.enrichment?.summary || dest.summary || `Explore ${dest.name}`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationHubPage({ params }: Props) {
  const { slug } = await params

  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  // Fetch cruise count for context pills
  let cruiseCount = 0
  try {
    const cruiseData = await fetchDestinationCruises(slug, 1, 1)
    cruiseCount = cruiseData.total
  } catch {
    // Cruise count is non-critical; degrade gracefully
  }

  const counts = { cruises: cruiseCount }

  return (
    <HubScaffold
      hero={destinationAdapter.heroData(destination)}
      contextPills={destinationAdapter.contextPills(destination, counts)}
      sections={destinationAdapter.sections(destination)}
      aiContext={destinationAdapter.aiContext(destination)}
      entityType="destination"
      entitySlug={slug}
      metadata={destination.metadata as Record<string, unknown> | undefined}
    />
  )
}
