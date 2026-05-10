import {
  pgTable, uuid, varchar, timestamp, boolean, pgEnum, customType, smallint, inet, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { userProfiles } from './user-profiles.schema'
import { agencies } from './agencies.schema'

const bytea = customType<{ data: Buffer; default: false }>({ dataType() { return 'bytea' } })

export const icPayoutAccountRailEnum = pgEnum('ic_payout_account_rail', [
  'interac_etransfer', 'eft', 'wise', 'wire', 'visa_direct',
])
export const icPayoutAccountStatusEnum = pgEnum('ic_payout_account_status', [
  'active', 'archived', 'unverified',
])

export const icPayoutAccounts = pgTable('ic_payout_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull().references(() => agencies.id),
  userId: uuid('user_id').notNull().references(() => userProfiles.id),

  label: varchar('label', { length: 80 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  rail: icPayoutAccountRailEnum('rail').notNull(),
  isDefaultForCurrency: boolean('is_default_for_currency').notNull().default(false),
  status: icPayoutAccountStatusEnum('status').notNull().default('unverified'),

  detailsEncrypted: bytea('details_encrypted').notNull(),
  encryptionKeyVersion: smallint('encryption_key_version').notNull(),
  detailsMask: varchar('details_mask', { length: 80 }).notNull(),

  providerName: varchar('provider_name', { length: 40 }),
  providerToken: varchar('provider_token', { length: 255 }),

  padAgreementVersion: varchar('pad_agreement_version', { length: 20 }),
  padAcceptedAt: timestamp('pad_accepted_at', { withTimezone: true }),
  padAcceptedIp: inet('pad_accepted_ip'),

  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Exactly one default per (user, currency) where status='active'
  oneDefaultPerCurrency: uniqueIndex('uniq_default_per_currency')
    .on(t.userId, t.currency)
    .where(sql`is_default_for_currency = true AND status = 'active'`),
}))

export const icPayoutAccountsRelations = relations(icPayoutAccounts, ({ one }) => ({
  user: one(userProfiles, { fields: [icPayoutAccounts.userId], references: [userProfiles.id] }),
  agency: one(agencies, { fields: [icPayoutAccounts.agencyId], references: [agencies.id] }),
}))

export type IcPayoutAccount = typeof icPayoutAccounts.$inferSelect
export type NewIcPayoutAccount = typeof icPayoutAccounts.$inferInsert
