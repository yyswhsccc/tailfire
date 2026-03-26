/**
 * Advisor Featured Deals Schema
 *
 * Join table linking advisor profiles to their featured deals.
 * Composite primary key on (advisorProfileId, dealId).
 */

import { pgTable, uuid, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { advisorProfiles } from './advisor-profiles.schema'
import { deals } from './deals.schema'

// ============================================================================
// TABLE: advisor_featured_deals
// ============================================================================

export const advisorFeaturedDeals = pgTable('advisor_featured_deals', {
  // Foreign Keys (composite PK)
  advisorProfileId: uuid('advisor_profile_id')
    .notNull()
    .references(() => advisorProfiles.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id')
    .notNull()
    .references(() => deals.id, { onDelete: 'cascade' }),

  // Ordering
  sortOrder: integer('sort_order').default(0),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.advisorProfileId, table.dealId] }),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const advisorFeaturedDealsRelations = relations(advisorFeaturedDeals, ({ one }) => ({
  advisorProfile: one(advisorProfiles, {
    fields: [advisorFeaturedDeals.advisorProfileId],
    references: [advisorProfiles.id],
  }),
  deal: one(deals, {
    fields: [advisorFeaturedDeals.dealId],
    references: [deals.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type AdvisorFeaturedDeal = typeof advisorFeaturedDeals.$inferSelect
export type NewAdvisorFeaturedDeal = typeof advisorFeaturedDeals.$inferInsert
