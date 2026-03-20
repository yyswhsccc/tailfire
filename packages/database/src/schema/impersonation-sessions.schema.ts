import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'

export const impersonationSessions = pgTable('impersonation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull(),
  targetUserId: uuid('target_user_id').notNull(),
  agencyId: uuid('agency_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: varchar('end_reason', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
