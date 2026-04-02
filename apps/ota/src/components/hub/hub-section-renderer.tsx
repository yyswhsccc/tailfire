// apps/ota/src/components/hub/hub-section-renderer.tsx

import { Suspense } from 'react'
import { SECTION_REGISTRY } from '@/lib/entity-hubs/section-registry'
import { SectionSkeleton } from './section-skeleton'
import { FeedDivider } from './feed-divider'
import type { SectionDescriptor, EntityType } from '@/lib/entity-hubs/types'

interface HubSectionRendererProps {
  sections: SectionDescriptor[]
  entityType: EntityType
  entitySlug: string
}

export function HubSectionRenderer({ sections, entityType, entitySlug }: HubSectionRendererProps) {
  return (
    <>
      {sections.map((descriptor, index) => {
        const entry = SECTION_REGISTRY[descriptor.key]
        if (!entry) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[HubSectionRenderer] No registry entry for section key: "${descriptor.key}"`)
          }
          return null
        }

        const SectionComponent = entry.component

        return (
          <div key={descriptor.key}>
            {index > 0 && <FeedDivider />}
            <Suspense fallback={<SectionSkeleton variant={entry.skeleton} />}>
              <SectionComponent
                entityType={entityType}
                entitySlug={entitySlug}
                title={descriptor.title}
                subtitle={descriptor.subtitle}
                viewAllHref={descriptor.viewAllHref}
                viewAllLabel={descriptor.viewAllLabel}
                sectionProps={descriptor.props}
              />
            </Suspense>
          </div>
        )
      })}
    </>
  )
}
