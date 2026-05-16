/**
 * Suppliers Schema
 *
 * Normalized supplier data for bookings (hotels, airlines, tour operators, etc.)
 */

import { pgTable, uuid, varchar, timestamp, jsonb, boolean, decimal, text, index } from 'drizzle-orm/pg-core'

export type SupplierContactInfo = {
  email?: string
  phone?: string
  website?: string
  address?: string
}

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }), // Legal business name for contracts
    supplierType: varchar('supplier_type', { length: 100 }), // e.g., 'hotel', 'airline', 'tour_operator'
    contactInfo: jsonb('contact_info').$type<SupplierContactInfo>(),

    // Business settings
    defaultCommissionRate: varchar('default_commission_rate', { length: 10 }), // e.g., "10.00" for 10%
    isActive: boolean('is_active').notNull().default(true),
    isPreferred: boolean('is_preferred').notNull().default(false),
    notes: text('notes'),

    // Commission tax defaults (PR-1) — pre-fills embedded_tax_* on commission_check_items
    defaultCommissionTaxType: varchar('default_commission_tax_type', { length: 50 }),
    defaultCommissionTaxRatePercent: decimal('default_commission_tax_rate_percent', { precision: 5, scale: 2 }),
    commissionIncludesTax: boolean('commission_includes_tax').notNull().default(false),

    // Default booking text
    defaultTermsAndConditions: text('default_terms_and_conditions'),
    defaultCancellationPolicy: text('default_cancellation_policy'),

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    isActiveIdx: index('idx_suppliers_is_active').on(table.isActive),
    isPreferredIdx: index('idx_suppliers_is_preferred').on(table.isPreferred),
  })
)

// TypeScript types
export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
