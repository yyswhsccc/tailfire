import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchRegionBySlug } from '@/lib/fetchers/regions'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { regionAdapter } from '@/lib/entity-hubs/adapters/region.adapter'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const region = await fetchRegionBySlug(slug)
    return {
      title: region.name,
      description:
        region.description ||
        `Explore the ${region.name} — ${region.sailingCount.toLocaleString()} cruises.`,
    }
  } catch {
    return { title: 'Region Not Found' }
  }
}

export default async function RegionHubPage({ params }: Props) {
  const { slug } = await params

  let region
  try {
    region = await fetchRegionBySlug(slug)
  } catch {
    notFound()
  }

  return (
    <HubScaffold
      hero={regionAdapter.heroData(region)}
      contextPills={regionAdapter.contextPills(region)}
      sections={regionAdapter.sections(region)}
      aiContext={regionAdapter.aiContext(region)}
      entityType="region"
      entitySlug={slug}
    />
  )
}
