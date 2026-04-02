// apps/ota/src/lib/entity-hubs/section-registry.ts

import type { SectionEntry } from './types'
import { CruisesSection } from '@/components/hub/sections/cruises-section'
import { ActivitiesSection } from '@/components/hub/sections/activities-section'
import { PhotosSection } from '@/components/hub/sections/photos-section'
import { DestinationsSection } from '@/components/hub/sections/destinations-section'

// Section components are async Server Components.
// Static imports + per-section Suspense boundaries.
// Do NOT use React.lazy() — it's a client-side API.
export const SECTION_REGISTRY: Record<string, SectionEntry> = {
  cruises:      { component: CruisesSection as any,      skeleton: 'grid-2' },
  activities:   { component: ActivitiesSection as any,   skeleton: 'grid-3' },
  photoMosaic:  { component: PhotosSection as any,       skeleton: 'mosaic' },
  destinations: { component: DestinationsSection as any, skeleton: 'grid-3' },
  // Future sections added by Plan 2:
  // flights, hotels, tours, offers, sailings, cabinCategories,
  // deckPlans, itinerary, nearby, ships
}
