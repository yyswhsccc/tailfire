import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { trips } from './trips.schema'

export const formTokens = pgTable('form_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 64 }).unique().notNull(),
  formType: varchar('form_type', { length: 50 }).notNull(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
  travelerIds: jsonb('traveler_ids').$type<string[]>(),
  agencyId: uuid('agency_id').notNull(),
  contextData: jsonb('context_data').$type<Record<string, unknown>>(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FormToken = typeof formTokens.$inferSelect
export type NewFormToken = typeof formTokens.$inferInsert
