/**
 * Advisor Profiles Schema
 *
 * Public-facing advisor profiles for the OTA consumer portal.
 * Each profile is linked to a user_profile and agency.
 */

import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'

// ============================================================================
// TABLE: advisor_profiles
// ============================================================================

export const advisorProfiles = pgTable('advisor_profiles', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // User Association (matches auth.users / user_profiles PK) — one profile per user
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => userProfiles.id, { onDelete: 'restrict' }),

  // Agency Association
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'restrict' }),

  // URL-friendly unique identifier
  slug: text('slug').unique().notNull(),

  // TLN (Travel Leaders Network) sync fields
  tlnProfileUrl: text('tln_profile_url'),
  tlnAgentId: text('tln_agent_id'),
  tlnLastSyncedAt: timestamp('tln_last_synced_at', { withTimezone: true }),

  // Display Information
  displayName: text('display_name'),
  title: text('title'),
  bio: text('bio'),
  photoUrl: text('photo_url'),

  // Categorisation (text arrays)
  specialties: text('specialties').array(),
  certifications: text('certifications').array(),
  languages: text('languages').array(),
  destinations: text('destinations').array(),

  // Reviews & supplemental content
  reviews: jsonb('reviews').default([]),
  bioSupplement: text('bio_supplement'),
  socialLinks: jsonb('social_links').default({}),

  // Publishing
  isPublished: boolean('is_published').default(false),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const advisorProfilesRelations = relations(advisorProfiles, ({ one }) => ({
  user: one(userProfiles, {
    fields: [advisorProfiles.userId],
    references: [userProfiles.id],
  }),
  agency: one(agencies, {
    fields: [advisorProfiles.agencyId],
    references: [agencies.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type AdvisorProfile = typeof advisorProfiles.$inferSelect
export type NewAdvisorProfile = typeof advisorProfiles.$inferInsert
