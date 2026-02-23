/**
 * Itinerary Feedback Schema
 *
 * Tracks client approvals and change requests for itineraries.
 * Created when clients approve or request changes to proposed itineraries.
 */

import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraries } from './trips.schema'
import { clientPortalUsers } from './client-portal-users.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const itineraryFeedbackTypeEnum = pgEnum('itinerary_feedback_type', [
  'approval',
  'change_request',
])

export const itineraryFeedbackStatusEnum = pgEnum('itinerary_feedback_status', [
  'pending',
  'reviewed',
  'resolved',
])

// ============================================================================
// TABLE: itinerary_feedback
// ============================================================================

export const itineraryFeedback = pgTable('itinerary_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign keys
  itineraryId: uuid('itinerary_id').notNull().references(() => itineraries.id, { onDelete: 'cascade' }),
  clientPortalUserId: uuid('client_portal_user_id').notNull().references(() => clientPortalUsers.id, { onDelete: 'cascade' }),

  // Agency scoping (for RLS)
  agencyId: uuid('agency_id').notNull(),

  // Feedback content
  feedbackType: itineraryFeedbackTypeEnum('feedback_type').notNull(),
  message: text('message'),
  activityNotes: jsonb('activity_notes').$type<{ activityId: string; activityName: string; note: string }[]>(),

  // Agent workflow
  status: itineraryFeedbackStatusEnum('status').default('pending').notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by'),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const itineraryFeedbackRelations = relations(itineraryFeedback, ({ one }) => ({
  itinerary: one(itineraries, {
    fields: [itineraryFeedback.itineraryId],
    references: [itineraries.id],
  }),
  clientPortalUser: one(clientPortalUsers, {
    fields: [itineraryFeedback.clientPortalUserId],
    references: [clientPortalUsers.id],
  }),
}))
