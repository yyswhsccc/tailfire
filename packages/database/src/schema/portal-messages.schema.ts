/**
 * Portal Messages Schema
 *
 * Stores agent-client messages for the client portal messaging feature.
 * Thread model: per contact (optionally scoped to a specific trip).
 * Not real-time — polling based. Agents write from Tailfire admin; consumers read/reply in the portal.
 */

import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'
import { trips } from './trips.schema'

export const portalMessages = pgTable(
  'portal_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id),
    tripId: uuid('trip_id').references(() => trips.id),
    senderType: text('sender_type').notNull(), // 'agent' | 'consumer'
    senderId: uuid('sender_id'), // user_profiles.id for agent, contacts.id for consumer
    senderName: text('sender_name'),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_portal_messages_contact').on(table.contactId, table.createdAt),
    index('idx_portal_messages_trip').on(table.tripId, table.createdAt),
  ],
)
