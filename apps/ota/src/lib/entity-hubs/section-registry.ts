// apps/ota/src/lib/entity-hubs/section-registry.ts

import type { SectionEntry } from './types'
import { CruisesSection } from '@/components/hub/sections/cruises-section'
import { SailingsSection } from '@/components/hub/sections/sailings-section'
import { ActivitiesSection } from '@/components/hub/sections/activities-section'
import { PhotosSection } from '@/components/hub/sections/photos-section'
import { DestinationsSection } from '@/components/hub/sections/destinations-section'
import { ToursSection } from '@/components/hub/sections/tours-section'
import { ShipsSection } from '@/components/hub/sections/ships-section'
import { CabinCategoriesSection } from '@/components/hub/sections/cabin-categories-section'
import { NearbySection } from '@/components/hub/sections/nearby-section'
import { OffersSection } from '@/components/hub/sections/offers-section'
import { DeckPlansSection } from '@/components/hub/sections/deck-plans-section'
import { FlightsSection } from '@/components/hub/sections/flights-section'

// Section components are async Server Components.
// Static imports + per-section Suspense boundaries.
// Do NOT use React.lazy() — it's a client-side API.
export const SECTION_REGISTRY: Record<string, SectionEntry> = {
  cruises:          { component: CruisesSection as any,          skeleton: 'grid-2' },
  sailings:         { component: SailingsSection as any,         skeleton: 'grid-2' },
  activities:       { component: ActivitiesSection as any,       skeleton: 'grid-3' },
  photoMosaic:      { component: PhotosSection as any,           skeleton: 'mosaic' },
  destinations:     { component: DestinationsSection as any,     skeleton: 'grid-3' },
  tours:            { component: ToursSection as any,            skeleton: 'grid-2' },
  ships:            { component: ShipsSection as any,            skeleton: 'grid-3' },
  cabinCategories:  { component: CabinCategoriesSection as any,  skeleton: 'grid-4' },
  nearby:           { component: NearbySection as any,           skeleton: 'scroll' },
  offers:           { component: OffersSection as any,           skeleton: 'banner' },
  deckPlans:        { component: DeckPlansSection as any,        skeleton: 'single' },
  flights:          { component: FlightsSection as any,          skeleton: 'grid-3' },
  // Future sections (Plan 3+):
  // hotels, itinerary
}
