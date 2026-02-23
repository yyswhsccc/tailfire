/**
 * Loyalty Programs Schema
 *
 * Agency-level loyalty programs catalog.
 * Admins manage programs (e.g., "Royal Caribbean Crown & Anchor Society").
 * Contact memberships can optionally link to a catalog entry.
 */

import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'

export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    providerName: varchar('provider_name', { length: 255 }).notNull(),
    programName: varchar('program_name', { length: 255 }).notNull(),
    programType: varchar('program_type', { length: 50 }).notNull().default('cruise'),

    logoUrl: text('logo_url'),
    websiteUrl: text('website_url'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agencyProviderProgram: uniqueIndex('loyalty_programs_agency_provider_program').on(
      table.agencyId,
      table.providerName,
      table.programName,
    ),
    agencyIdx: index('idx_loyalty_programs_agency').on(table.agencyId),
    typeIdx: index('idx_loyalty_programs_type').on(table.programType),
  }),
)

// Relations
export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ one }) => ({
  agency: one(agencies, {
    fields: [loyaltyPrograms.agencyId],
    references: [agencies.id],
  }),
}))

// TypeScript types
export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect
export type NewLoyaltyProgram = typeof loyaltyPrograms.$inferInsert
