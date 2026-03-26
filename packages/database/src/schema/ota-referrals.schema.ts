/**
 * OTA Referrals Schema
 *
 * Tracks referral sessions from the OTA consumer portal.
 * Links visitor sessions to advisor profiles and optional contact conversion.
 */

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { contacts } from './contacts.schema'
import { agencies } from './agencies.schema'

// ============================================================================
// TABLE: ota_referrals
// ============================================================================

export const otaReferrals = pgTable('ota_referrals', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Session tracking
  sessionId: text('session_id').notNull(),
  advisorSlug: text('advisor_slug').notNull(),
  landingUrl: text('landing_url'),

  // Referral source (microsite, direct_link, deal_share)
  referralSource: text('referral_source'),

  // Cookie expiry timestamp
  cookieExpiry: timestamp('cookie_expiry', { withTimezone: true }),

  // Conversion tracking (nullable - set when visitor becomes contact)
  convertedToContactId: uuid('converted_to_contact_id')
    .references(() => contacts.id, { onDelete: 'set null' }),

  // Agency Association
  agencyId: uuid('agency_id')
    .references(() => agencies.id, { onDelete: 'restrict' }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const otaReferralsRelations = relations(otaReferrals, ({ one }) => ({
  convertedContact: one(contacts, {
    fields: [otaReferrals.convertedToContactId],
    references: [contacts.id],
  }),
  agency: one(agencies, {
    fields: [otaReferrals.agencyId],
    references: [agencies.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type OtaReferral = typeof otaReferrals.$inferSelect
export type NewOtaReferral = typeof otaReferrals.$inferInsert
