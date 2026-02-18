/**
 * Tailfire Database Schema
 *
 * This is the central export for all Drizzle ORM schema definitions.
 * Import this in apps/api to get the full typed database schema.
 *
 * Schema organization:
 * - auth.schema.ts: Authentication tables (users, sessions, roles)
 * - agencies.schema.ts: Agency and branch tables
 * - contacts.schema.ts: Contact management tables
 * - trips.schema.ts: Trip management tables
 * - bookings.schema.ts: Booking tables (all 7 types)
 * - financials.schema.ts: Payments, commissions, trust ledger
 * - tasks.schema.ts: Task management tables
 * - cruise.schema.ts: Cruise catalogue tables
 * - lookups.schema.ts: Lookup/reference tables
 *
 * @example
 * ```typescript
 * import { createDbClient } from '@tailfire/database'
 * import * as schema from '@tailfire/database/schema'
 *
 * const db = createDbClient(process.env.DATABASE_URL!)
 * const trips = await db.query.trips.findMany()
 * ```
 */

// Schema exports - Active development (Phase 3)
export * from './contacts.schema'
export * from './contact-shares.schema'
export * from './contact-documents.schema'
export * from './trips.schema'
export * from './trip-shares.schema'
export * from './trip-media.schema'
export * from './tags.schema'
export * from './itinerary-days.schema'
export * from './activities.schema'

// Activity extension schemas (polymorphic pattern)
export * from './suppliers.schema'
export * from './activity-media.schema'
export * from './activity-documents.schema'
export * from './activity-pricing.schema'
export * from './activity-suppliers.schema'

// Financial system schema
export * from './financials.schema'

// Payment schedule templates (agency-scoped reusable patterns)
export * from './payment-templates.schema'

// Itinerary and package templates (agency-scoped reusable structures)
export * from './itinerary-templates.schema'
export * from './package-templates.schema'

// Insurance schema
export * from './insurance.schema'

// Component-specific detail schemas
export * from './flight-details.schema'
export * from './flight-segments.schema'
export * from './lodging-details.schema'
export * from './transportation-details.schema'
export * from './dining-details.schema'
export * from './port-info-details.schema'
export * from './options-details.schema'
export * from './custom-cruise-details.schema'
export * from './custom-tour-details.schema'
export * from './tour-day-details.schema'

// Cruise booking sessions (FusionAPI integration)
export * from './cruise-booking-sessions.schema'

// Amenities system (dynamic, API-driven amenities)
export * from './amenities.schema'

// API credentials management
export * from './api-credentials.schema'

// API provider runtime configurations
export * from './api-provider-configs.schema'

// Catalog schema definition (for FDW architecture)
export * from './catalog.schema'

// Cruise reference data schemas (in catalog schema)
export * from './cruise-lines.schema'
export * from './cruise-ships.schema'
export * from './cruise-regions.schema'
export * from './cruise-ports.schema'

// Cruise data repository schemas (ship assets, sailings, prices)
export * from './cruise-ship-images.schema'
export * from './cruise-ship-decks.schema'
export * from './cruise-ship-cabin-types.schema'
export * from './cruise-cabin-images.schema'
export * from './cruise-sailings.schema'
export * from './cruise-sailing-regions.schema'
export * from './cruise-sailing-stops.schema'
export * from './cruise-sailing-cabin-prices.schema'
export * from './cruise-alternate-sailings.schema'
export * from './cruise-sync-raw.schema'
export * from './cruise-ftp-file-sync.schema'
export * from './cruise-sync-history.schema'

// Package-related schemas (packages are now activity_type='package')
// Package details extend activity with supplier/payment info
export * from './package-details.schema'
// Activity travelers links travelers to activities (especially packages)
export * from './activity-travelers.schema'

// Auth & Multi-tenancy (Phase 1 Auth Implementation)
export * from './agencies.schema'
export * from './user-profiles.schema'

// Email system (logs and templates)
export * from './email.schema'

// Trip Orders (invoice snapshots with versioning)
export * from './trip-orders.schema'

// Tour catalog schemas (in catalog schema)
export * from './tour-operators.schema'
export * from './tours.schema'
export * from './tour-departures.schema'
export * from './tour-departure-pricing.schema'
export * from './tour-itinerary-days.schema'
export * from './tour-hotels.schema'
export * from './tour-media.schema'
export * from './tour-inclusions.schema'
export * from './tour-sync-history.schema'
export * from './geocoding-cache.schema'

// Automation system (job queue history)
export * from './automation-job-history.schema'

// Notification system
export * from './notification-preferences.schema'
export * from './platform-notifications.schema'

// Task system (Calendar integration)
export * from './tasks.schema'

// Notes system (internal agent notes on contacts/trips)
export * from './notes.schema'

// Calendar events (standalone meetings, calls, follow-ups)
export * from './calendar-events.schema'

// OCR document import jobs
export * from './ocr-import-jobs.schema'

// OCR supplier runbooks (extraction hints per supplier/document type)
export * from './ocr-supplier-runbooks.schema'

// Client Portal
export * from './client-portal-users.schema'
export * from './itinerary-feedback.schema'

// Later phases:
// export * from './financials.schema'
// export * from './tasks.schema'
// export * from './cruise.schema'
// export * from './lookups.schema'
