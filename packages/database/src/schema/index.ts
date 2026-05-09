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
export * from './contact-loyalty-programs.schema'
export * from './loyalty-programs.schema'
export * from './trips.schema'
export * from './trip-shares.schema'
export * from './trip-group-shares.schema'
export * from './trip-group-documents.schema'
export * from './trip-group-media.schema'
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

// Commission system (check-based commission tracking)
export * from './commission-checks.schema'

// Agency tax filing config (CRA payer identity for T4A filings)
export * from './agency-tax-filing-config.schema'

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
// Per-traveler booking records (confirmation #, pricing per traveler)
export * from './traveler-bookings.schema'

// Auth & Multi-tenancy (Phase 1 Auth Implementation)
export * from './agencies.schema'
export * from './user-profiles.schema'

// Email system (logs and templates)
export * from './email.schema'

// Email accounts (agent personal IMAP/SMTP — separate from EmailModule)
export * from './email-accounts.schema'
export * from './synced-emails.schema'
export * from './email-attachments.schema'

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

// Vacation package catalog (in catalog schema)
export * from './vacation-gateways.schema'
export * from './vacation-destinations.schema'
export * from './vacation-hotels.schema'
export * from './vacation-gateway-destinations.schema'
export * from './vacation-tour-operators.schema'
export * from './vacation-sync-history.schema'

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

// Proposal comments (per-activity commenting on shared proposals)
export * from './proposal-comments.schema'

// Client activity responses (per-activity confirm/decline on published versions)
export * from './client-activity-responses.schema'

// Later phases:
// export * from './financials.schema'
// export * from './tasks.schema'
// export * from './cruise.schema'
// export * from './lookups.schema'

// Client Portal
export * from './client-portal-users.schema'
export * from './itinerary-feedback.schema'

// Document template system (block-based Handlebars templates)
export * from './document-templates.schema'

// Security audit logs (RBAC hardening — permission denials, role changes, impersonation)
export * from './security-audit-logs.schema'

// Contact share requests (RBAC hardening — agent requests full access to another agent's contact)
export * from './contact-share-requests.schema'

// Impersonation sessions (RBAC hardening — admin views agent's account)
export * from './impersonation-sessions.schema'

// API Health Checks (periodic external API health monitoring)
export * from './api-health-checks.schema'

// Portal Messages (agent-client messaging via client portal)
export * from './portal-messages.schema'

// Form tokens (token-based public forms: insurance waivers, intake forms)
export * from './form-tokens.schema'

// OTA Consumer Portal (advisor profiles, deals, referrals, published trips)
export * from './advisor-profiles.schema'
export * from './deals.schema'
export * from './advisor-featured-deals.schema'
export * from './ota-referrals.schema'
export * from './ota-published-trips.schema'

// Destinations normalization (unified hub for ports, cities, regions)
export * from './destinations.schema'
export * from './destination-aliases.schema'
export * from './destination-ports.schema'
export * from './destination-regions.schema'
export * from './destination-cache.schema'

// Vacation enrichment and bridging (public schema)
export * from './vacation-hotel-enrichment.schema'
export * from './destination-vacation-destinations.schema'

// Planning sessions (AI Concierge journey tracking)
export * from './planning-sessions.schema'
export * from './planning-session-messages.schema'
export * from './planning-session-items.schema'

// OTA trip requests (consumer-side trip builder)
export * from './ota-trip-requests.schema'

// Contact merge support (duplicate dismissals)
export * from './contact-duplicate-dismissals.schema'

// Consumer activity tracking (OTA browsing signals + AI summaries)
export * from './consumer-activity.schema'
export * from './consumer-insights.schema'
