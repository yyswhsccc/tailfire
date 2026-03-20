import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const securityAuditLogs = pgTable('security_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: varchar('event', { length: 100 }).notNull(),
  userId: uuid('user_id'),
  actorId: uuid('actor_id'),
  agencyId: uuid('agency_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
