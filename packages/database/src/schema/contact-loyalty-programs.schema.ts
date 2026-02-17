/**
 * Contact Loyalty Programs Schema
 *
 * Loyalty/rewards program memberships for contacts (cruise lines, airlines, hotels, etc.)
 * No agency_id column — RLS enforced via JOIN to contacts table.
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { contacts } from './contacts.schema'

export const contactLoyaltyPrograms = pgTable(
  'contact_loyalty_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),

    programName: varchar('program_name', { length: 255 }).notNull(),
    providerName: varchar('provider_name', { length: 255 }).notNull(),
    membershipNumber: varchar('membership_number', { length: 100 }).notNull(),
    tierLevel: varchar('tier_level', { length: 100 }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueProviderMembership: unique('contact_loyalty_programs_contact_id_provider_name_membership_key').on(
      table.contactId,
      table.providerName,
      table.membershipNumber,
    ),
    contactIdIdx: index('idx_loyalty_contact').on(table.contactId),
    providerNameIdx: index('idx_loyalty_provider').on(table.providerName),
  }),
)

// Relations
export const contactLoyaltyProgramsRelations = relations(contactLoyaltyPrograms, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactLoyaltyPrograms.contactId],
    references: [contacts.id],
  }),
}))

// TypeScript types
export type ContactLoyaltyProgram = typeof contactLoyaltyPrograms.$inferSelect
export type NewContactLoyaltyProgram = typeof contactLoyaltyPrograms.$inferInsert
