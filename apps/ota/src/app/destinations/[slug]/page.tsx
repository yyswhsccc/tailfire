import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchDestinationBySlug } from '@/lib/fetchers/destinations'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedDivider } from '@/components/hub/feed-divider'
import { SectionSkeleton } from '@/components/hub/section-skeleton'
import { PageContextBridge } from '@/components/page-context-bridge'
import { CruisesSection } from './sections/cruises-section'
import { ActivitiesSection } from './sections/activities-section'
import { PhotosSection } from './sections/photos-section'

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

  const enrichment = destination.enrichment
  const description = enrichment?.summary || destination.summary
  const heroImage = destination.heroImageUrl || enrichment?.photos?.[0]?.url

  const pills: Array<{ emoji: string; label: string }> = []
  if (destination.countryCode)
    pills.push({ emoji: '\u{1F4CD}', label: destination.countryCode })

  const metaItems: Array<{ label: string }> = []
  if (enrichment?.averageRating)
    metaItems.push({ label: `\u2B50 ${enrichment.averageRating.toFixed(1)}` })
  if (enrichment?.totalReviewCount)
    metaItems.push({
      label: `${enrichment.totalReviewCount.toLocaleString()} reviews`,
    })

  return (
    <>
      <PageContextBridge
        type="destination"
        slug={slug}
        name={destination.name}
      />

      <HubHero
        title={destination.name}
        badge={destination.countryCode || undefined}
        imageUrl={heroImage}
      >
        {metaItems.length > 0 && <HubHeroMeta items={metaItems} />}
        <HubHeroCta
          primaryLabel={`Plan a Trip to ${destination.name}`}
          primaryPrompt={`Help me plan a trip to ${destination.name}`}
          entityType="destination"
          entitySlug={slug}
          entityName={destination.name}
        />
      </HubHero>

      <HubContext
        description={description}
        pills={pills.length > 0 ? pills : undefined}
      />

      {/* Cruises — SSR streamed via Suspense */}
      <Suspense fallback={<SectionSkeleton cardCount={2} />}>
        <CruisesSection slug={slug} destinationName={destination.name} />
      </Suspense>

      <FeedDivider />

      {/* Activities — text-only from enrichment cache */}
      <ActivitiesSection
        destinationName={destination.name}
        enrichment={enrichment}
      />

      <FeedDivider />

      {/* Photos — from enrichment cache */}
      <PhotosSection photos={enrichment?.photos || []} />
    </>
  )
}
