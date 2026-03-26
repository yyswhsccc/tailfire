/**
 * Deals Schema
 *
 * Agency-scoped travel deals for the OTA consumer portal.
 * Supports external deal ingestion with source/ID dedup.
 */

import { pgTable, uuid, text, boolean, timestamp, date, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'

// ============================================================================
// TABLE: deals
// ============================================================================

export const deals = pgTable('deals', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'restrict' }),

  // URL-friendly unique identifier
  slug: text('slug').unique().notNull(),

  // External source tracking (for dedup on import)
  externalSource: text('external_source'),
  externalId: text('external_id'),

  // Deal Information
  title: text('title').notNull(),
  description: text('description'),
  heroImageUrl: text('hero_image_url'),

  // Product classification (flight, cruise, tour, hotel, package)
  productType: text('product_type').notNull(),

  // Pricing (flexible JSONB)
  pricing: jsonb('pricing').default({}),

  // Validity window
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),

  // Destination tags
  destinations: text('destinations').array(),

  // Supplier
  supplierName: text('supplier_name'),

  // Publishing
  isPublished: boolean('is_published').default(false),

  // SEO metadata
  seoMeta: jsonb('seo_meta').default({}),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
// NOTE: Partial unique index on (external_source, external_id) WHERE both NOT NULL
// is created in migration SQL — Drizzle doesn't support partial unique indexes declaratively.

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const dealsRelations = relations(deals, ({ one }) => ({
  agency: one(agencies, {
    fields: [deals.agencyId],
    references: [agencies.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type Deal = typeof deals.$inferSelect
export type NewDeal = typeof deals.$inferInsert
