/**
 * Contact Duplicate Dismissals Schema
 *
 * Tracks agent decisions to dismiss suggested duplicate contact pairs,
 * preventing them from surfacing again in the merge workflow.
 */

import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { contacts } from './contacts.schema'

// ============================================================================
// TABLE: contact_duplicate_dismissals
// ============================================================================

export const contactDuplicateDismissals = pgTable('contact_duplicate_dismissals', {
  id: uuid('id').primaryKey().defaultRandom(),

  agencyId: uuid('agency_id').notNull(),

  contactId1: uuid('contact_id1').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  contactId2: uuid('contact_id2').notNull().references(() => contacts.id, { onDelete: 'cascade' }),

  matchType: varchar('match_type', { length: 50 }).notNull(),

  dismissedBy: uuid('dismissed_by').notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const contactDuplicateDismissalsRelations = relations(contactDuplicateDismissals, ({ one }) => ({
  contact1: one(contacts, {
    fields: [contactDuplicateDismissals.contactId1],
    references: [contacts.id],
    relationName: 'dismissedContact1',
  }),
  contact2: one(contacts, {
    fields: [contactDuplicateDismissals.contactId2],
    references: [contacts.id],
    relationName: 'dismissedContact2',
  }),
}))
