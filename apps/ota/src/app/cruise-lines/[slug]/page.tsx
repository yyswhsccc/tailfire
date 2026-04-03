import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchCruiseLineBySlug } from '@/lib/fetchers/cruise-lines'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { cruiseLineAdapter } from '@/lib/entity-hubs/adapters/cruise-line.adapter'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const line = await fetchCruiseLineBySlug(slug)
    return {
      title: line.name,
      description: `Explore ${line.name} — ${line.shipCount} ships, ${line.sailingCount.toLocaleString()} sailings.`,
    }
  } catch {
    return { title: 'Cruise Line Not Found' }
  }
}

export default async function CruiseLineHubPage({ params }: Props) {
  const { slug } = await params

  let line
  try {
    line = await fetchCruiseLineBySlug(slug)
  } catch {
    notFound()
  }

  return (
    <HubScaffold
      hero={cruiseLineAdapter.heroData(line)}
      contextPills={cruiseLineAdapter.contextPills(line)}
      sections={cruiseLineAdapter.sections(line)}
      aiContext={cruiseLineAdapter.aiContext(line)}
      entityType="cruise_line"
      entitySlug={slug}
    />
  )
}
