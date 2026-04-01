/**
 * OTA Trip Requests Schema
 *
 * Tracks trip requests from the OTA consumer portal.
 * Consumers build trip requests with components (flights, cruises, hotels, tours)
 * which are then promoted into full Tailfire trips upon submission.
 */

import { pgTable, uuid, text, varchar, boolean, date, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

// ============================================================================
// TABLE: ota_trip_requests
// ============================================================================

export const otaTripRequests = pgTable('ota_trip_requests', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Consumer identity
  contactEmail: text('contact_email'),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),

  // Attribution
  advisorSlug: text('advisor_slug'),
  referralSessionId: text('referral_session_id'),
  source: text('source').default('ota'),
  tripGroupId: uuid('trip_group_id'),

  // Trip overview
  title: text('title'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  travelers: integer('travelers').default(1),
  specialRequests: text('special_requests'),

  // Phase 2: Session tracking
  sessionId: text('session_id'),
  // Phase 2: Share token
  shareToken: varchar('share_token', { length: 64 }),
  // Phase 2: Submit flow
  dateFlexibility: boolean('date_flexibility').default(false),
  travelStyle: varchar('travel_style', { length: 20 }),
  // Phase 2: Linked contact
  contactId: uuid('contact_id'),
  // Phase 2: Inspiration cards (separate from promotable components)
  inspiration: jsonb('inspiration').default([]),
  // Phase 2: Board display order
  boardOrder: jsonb('board_order').default([]),

  // Components JSONB
  components: jsonb('components').notNull().default([]),
  schemaVersion: integer('schema_version').notNull().default(1),

  // Status: draft | submitted | promoted | failed | expired
  status: text('status').notNull().default('draft'),

  // Resolution (populated on submit)
  resolvedOwnerId: uuid('resolved_owner_id'),
  resolvedAgencyId: uuid('resolved_agency_id'),
  attribution: text('attribution'),

  // Promotion tracking
  promotedTripId: uuid('promoted_trip_id'), // App-level reference, NOT DB FK
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
  promotedBy: text('promoted_by'),
  promotionError: text('promotion_error'),
  promotionAttempts: integer('promotion_attempts').default(0),
  lastPromotionAt: timestamp('last_promotion_at', { withTimezone: true }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  emailIdx: index('idx_ota_trip_requests_email').on(table.contactEmail),
  statusIdx: index('idx_ota_trip_requests_status').on(table.status),
  advisorIdx: index('idx_ota_trip_requests_advisor').on(table.advisorSlug),
  sessionIdx: index('idx_ota_trip_requests_session').on(table.sessionId),
  shareTokenIdx: index('idx_ota_trip_requests_share_token').on(table.shareToken),
  contactIdx: index('idx_ota_trip_requests_contact').on(table.contactId),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type OtaTripRequest = typeof otaTripRequests.$inferSelect
export type NewOtaTripRequest = typeof otaTripRequests.$inferInsert
