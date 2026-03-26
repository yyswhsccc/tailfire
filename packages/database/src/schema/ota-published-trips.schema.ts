/**
 * OTA Published Trips Schema
 *
 * Published trip listings on the OTA consumer portal.
 * Links itinerary templates to advisor profiles with rendered content snapshots.
 */

import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { itineraryTemplates } from './itinerary-templates.schema'
import { advisorProfiles } from './advisor-profiles.schema'

// ============================================================================
// TABLE: ota_published_trips
// ============================================================================

export const otaPublishedTrips = pgTable('ota_published_trips', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'restrict' }),

  // Source template
  templateId: uuid('template_id')
    .notNull()
    .references(() => itineraryTemplates.id, { onDelete: 'restrict' }),

  // Advisor who published this trip
  advisorProfileId: uuid('advisor_profile_id')
    .notNull()
    .references(() => advisorProfiles.id, { onDelete: 'restrict' }),

  // URL-friendly unique identifier
  slug: text('slug').unique().notNull(),

  // Publish classification (hosted, featured, recommended, custom)
  publishType: text('publish_type').notNull(),

  // Display content
  headline: text('headline'),
  callToAction: text('call_to_action').default('Inquire About This Trip'),

  // Rendered snapshot of template content (JSONB)
  renderedSnapshot: jsonb('rendered_snapshot').notNull(),

  // Hero image
  heroImageUrl: text('hero_image_url'),

  // Publishing
  isPublished: boolean('is_published').default(true),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const otaPublishedTripsRelations = relations(otaPublishedTrips, ({ one }) => ({
  agency: one(agencies, {
    fields: [otaPublishedTrips.agencyId],
    references: [agencies.id],
  }),
  template: one(itineraryTemplates, {
    fields: [otaPublishedTrips.templateId],
    references: [itineraryTemplates.id],
  }),
  advisorProfile: one(advisorProfiles, {
    fields: [otaPublishedTrips.advisorProfileId],
    references: [advisorProfiles.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type OtaPublishedTrip = typeof otaPublishedTrips.$inferSelect
export type NewOtaPublishedTrip = typeof otaPublishedTrips.$inferInsert
