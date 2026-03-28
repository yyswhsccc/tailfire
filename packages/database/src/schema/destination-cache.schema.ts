/**
 * Destination Cache Schema
 *
 * Caches enrichment data from external sources (SerpAPI/TripAdvisor, Amadeus
 * Activities, Google Places) for a given destination. Tracks freshness, locking
 * for concurrent fetch workers, cost accounting, and error recovery.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { destinations } from './destinations.schema'

// ============================================================================
// TABLE: destination_cache
// ============================================================================

export const destinationCache = pgTable('destination_cache', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // FK → destinations
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),

  // Which external API this cache row represents
  // CHECK (source IN ('tripadvisor','amadeus_activities','google_places')) — enforced in migration SQL
  source: text('source').notNull(),

  // BCP-47 locale; most sources use 'en'
  locale: text('locale').default('en'),

  // Status of this cache entry
  // CHECK (status IN ('fresh','stale','refreshing','failed','disabled')) — enforced in migration SQL
  status: text('status').default('fresh'),

  // Stable cache key (e.g., "tripadvisor:destination_id:en")
  cacheKey: text('cache_key').notNull(),

  // Raw API response (verbatim, for debugging / replay)
  rawPayload: jsonb('raw_payload'),

  // Normalized, application-level payload (what the app actually reads)
  normalizedPayload: jsonb('normalized_payload'),

  // AI-generated or human-edited Markdown summary for the destination
  summaryMd: text('summary_md'),

  // URLs that were fetched as part of this enrichment pass
  sourceUrls: jsonb('source_urls').default([]),

  // Timing
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  refreshAfterAt: timestamp('refresh_after_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  // Error tracking
  lastHttpStatus: integer('last_http_status'),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  consecutiveFailures: integer('consecutive_failures').default(0),

  // Operational counters
  fetchCount: integer('fetch_count').default(0),

  // Content hash (SHA-256 of normalizedPayload) for change detection
  payloadHash: text('payload_hash'),

  // Schema version for forward-compatible migrations of normalizedPayload
  version: integer('version').default(1),

  // Distributed lock for concurrent fetch workers
  lockToken: uuid('lock_token'),
  lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }),

  // API cost accounting (credits / units consumed per fetch)
  costUnits: numeric('cost_units', { precision: 10, scale: 4 }).default('0'),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // One cache row per (destination, source, locale) triple
  uniqueSourceLocale: unique('destination_cache_destination_source_locale_key').on(
    table.destinationId,
    table.source,
    table.locale,
  ),
  destinationIdx: index('destination_cache_destination_idx').on(table.destinationId),
  statusIdx: index('destination_cache_status_idx').on(table.status),
  refreshAfterIdx: index('destination_cache_refresh_after_idx').on(table.refreshAfterAt),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const destinationCacheRelations = relations(destinationCache, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationCache.destinationId],
    references: [destinations.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type DestinationCache = typeof destinationCache.$inferSelect
export type NewDestinationCache = typeof destinationCache.$inferInsert
