/**
 * @tailfire/database
 *
 * Shared database layer for Tailfire Beta monorepo
 *
 * Exports:
 * - createDbClient: Factory function for Drizzle database client
 * - runMigrations: Migration runner (apps/api only)
 * - resetDatabase: Database reset utility (development only)
 * - seedDatabase: Database seeding utility (development/testing only)
 * - schema: Full database schema (re-exported for convenience)
 */

export { createDbClient } from './client'
export { runMigrations } from './migrate'
export { resetDatabase } from './reset'
export { seedDatabase } from './seed'
export * as schema from './schema'
export type { Database } from './client'

// Direct exports for commonly used constants
export { VALID_DOCUMENT_TYPES, type DocumentType } from './schema/activity-documents.schema'
export { VALID_CONTACT_DOCUMENT_TYPES, type ContactDocumentType } from './schema/contact-documents.schema'
export { mediaTypeEnum, componentEntityTypeEnum, type MediaType, type ComponentEntityType } from './schema/activity-media.schema'

// Cruise schema exports
export { type DeckMetadata } from './schema/cruise-ship-decks.schema'
export { cruiseFtpFileSync, type CruiseFtpFileSync, type NewCruiseFtpFileSync } from './schema/cruise-ftp-file-sync.schema'
export {
  cruiseSyncHistory,
  type CruiseSyncHistory,
  type NewCruiseSyncHistory,
  type SyncHistoryStatus,
  type SyncHistoryError,
  type SyncHistoryMetrics,
} from './schema/cruise-sync-history.schema'

// Tour catalog schema exports
export { tourOperators, type TourOperator, type NewTourOperator } from './schema/tour-operators.schema'
export { tours, type Tour, type NewTour } from './schema/tours.schema'
export { tourDepartures, type TourDeparture, type NewTourDeparture } from './schema/tour-departures.schema'
export { tourDeparturePricing, type TourDeparturePricing, type NewTourDeparturePricing } from './schema/tour-departure-pricing.schema'
export { tourItineraryDays, type TourItineraryDay, type NewTourItineraryDay } from './schema/tour-itinerary-days.schema'
export { tourHotels, type TourHotel, type NewTourHotel } from './schema/tour-hotels.schema'
export { tourMedia, type TourMedia, type NewTourMedia } from './schema/tour-media.schema'
export { tourInclusions, type TourInclusion, type NewTourInclusion } from './schema/tour-inclusions.schema'
export { tourSyncHistory, type TourSyncHistory, type NewTourSyncHistory } from './schema/tour-sync-history.schema'
export { geocodingCache, type GeocodingCache, type NewGeocodingCache } from './schema/geocoding-cache.schema'

// Vacation catalog schema exports
export { vacationGateways, type VacationGateway, type NewVacationGateway } from './schema/vacation-gateways.schema'
export { vacationDestinations, type VacationDestination, type NewVacationDestination } from './schema/vacation-destinations.schema'
export { vacationHotels, type VacationHotel, type NewVacationHotel } from './schema/vacation-hotels.schema'
export { vacationGatewayDestinations } from './schema/vacation-gateway-destinations.schema'
export { vacationTourOperators, type VacationTourOperator, type NewVacationTourOperator } from './schema/vacation-tour-operators.schema'
export { vacationSyncHistory, type VacationSyncHistoryRecord } from './schema/vacation-sync-history.schema'
export {
  vacationHotelEnrichment,
  type VacationHotelEnrichmentRecord,
  type NewVacationHotelEnrichmentRecord,
} from './schema/vacation-hotel-enrichment.schema'
