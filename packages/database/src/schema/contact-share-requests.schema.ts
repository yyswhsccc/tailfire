import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'

export const contactShareRequests = pgTable('contact_share_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  requesterId: uuid('requester_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  agencyId: uuid('agency_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reason: text('reason'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
