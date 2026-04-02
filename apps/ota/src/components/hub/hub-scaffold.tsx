// apps/ota/src/components/hub/hub-scaffold.tsx

import { HubHero } from './hub-hero'
import { HubHeroCta } from './hub-hero-cta'
import { HubContextPills } from './hub-context-pills'
import { HubSectionRenderer } from './hub-section-renderer'
import { PageContextBridge } from '@/components/page-context-bridge'
import type { HubScaffoldProps } from '@/lib/entity-hubs/types'

export function HubScaffold({
  hero,
  contextPills,
  sections,
  aiContext: _aiContext,
  entityType,
  entitySlug,
}: HubScaffoldProps) {
  return (
    <>
      <PageContextBridge
        type={entityType === 'cruise_line' ? 'cruise_line' : entityType}
        slug={entitySlug}
        name={hero.title}
      />

      <HubHero
        title={hero.title}
        badge={hero.badge}
        subtitle={hero.subtitle}
        imageUrl={hero.imageUrl}
        urgencyBadge={hero.urgencyBadge}
      >
        {hero.description && (
          <p className="mt-2 hidden max-w-xl text-sm text-white/80 lg:block">{hero.description}</p>
        )}
        <HubHeroCta
          primaryLabel={hero.ctaLabel ?? `Plan a Trip to ${hero.title}`}
          primaryPrompt={`Help me plan a trip to ${hero.title}`}
          entityType={entityType}
          entitySlug={entitySlug}
          entityName={hero.title}
        />
      </HubHero>

      <HubContextPills pills={contextPills} />

      <div className="py-8">
        <HubSectionRenderer
          sections={sections}
          entityType={entityType}
          entitySlug={entitySlug}
        />
      </div>
    </>
  )
}
