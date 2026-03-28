/**
 * Planning Sessions Schema
 *
 * Tracks AI Concierge planning sessions for OTA visitors. A session
 * captures the full journey of a visitor from anonymous browsing through
 * authenticated wishlist building to trip conversion.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { contacts } from './contacts.schema'
import { clientPortalUsers } from './client-portal-users.schema'
import { trips } from './trips.schema'
import { planningSessionMessages } from './planning-session-messages.schema'
import { planningSessionItems } from './planning-session-items.schema'

// ============================================================================
// TABLE: planning_sessions
// ============================================================================

export const planningSessions = pgTable('planning_sessions', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // FK → agencies (required, all sessions are agency-scoped)
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id),

  // Anonymous visitor token (ota_vid cookie)
  visitorToken: text('visitor_token'),

  // FK → contacts — nullable, linked after auth
  contactId: uuid('contact_id').references(() => contacts.id),

  // FK → client_portal_users — nullable
  clientPortalUserId: uuid('client_portal_user_id').references(
    () => clientPortalUsers.id,
  ),

  // Session lifecycle status
  // CHECK (status IN ('active','claimed','converted','archived')) — enforced in migration SQL
  status: text('status').default('active'),

  // Human-readable title (e.g., "Caribbean Cruise 2027")
  title: text('title'),

  // AI-generated summary of the session intent
  summary: text('summary'),

  // Origin channel
  sourceChannel: text('source_channel').default('ota'),

  // Traveler preferences captured during session
  preferences: jsonb('preferences').default({}),

  // Rolling AI conversation context
  sessionContext: jsonb('session_context').default({}),

  // AI memory for cross-session continuity
  aiMemory: jsonb('ai_memory').default({}),

  // FK → trips — set when session is converted to a trip
  convertedTripId: uuid('converted_trip_id').references(() => trips.id),

  // Timestamps
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  agencyIdIdx: index('planning_sessions_agency_id_idx').on(table.agencyId),
  contactIdIdx: index('planning_sessions_contact_id_idx').on(table.contactId),
  visitorTokenIdx: index('planning_sessions_visitor_token_idx').on(
    table.visitorToken,
  ),
  statusIdx: index('planning_sessions_status_idx').on(table.status),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const planningSessionsRelations = relations(
  planningSessions,
  ({ one, many }) => ({
    agency: one(agencies, {
      fields: [planningSessions.agencyId],
      references: [agencies.id],
    }),
    contact: one(contacts, {
      fields: [planningSessions.contactId],
      references: [contacts.id],
    }),
    clientPortalUser: one(clientPortalUsers, {
      fields: [planningSessions.clientPortalUserId],
      references: [clientPortalUsers.id],
    }),
    convertedTrip: one(trips, {
      fields: [planningSessions.convertedTripId],
      references: [trips.id],
    }),
    messages: many(planningSessionMessages),
    items: many(planningSessionItems),
  }),
)

// ============================================================================
// TypeScript types
// ============================================================================

export type PlanningSession = typeof planningSessions.$inferSelect
export type NewPlanningSession = typeof planningSessions.$inferInsert
