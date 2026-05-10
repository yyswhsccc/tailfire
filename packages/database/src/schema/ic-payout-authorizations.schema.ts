import { pgTable, uuid, varchar, timestamp, boolean, pgEnum, inet, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userProfiles } from './user-profiles.schema'
import { agencies } from './agencies.schema'

export const icPayoutAuthorizationStatusEnum = pgEnum('ic_payout_authorization_status', [
  'active', 'superseded', 'revoked',
])

export const icPayoutAuthorizations = pgTable('ic_payout_authorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull().references(() => agencies.id),
  userId: uuid('user_id').notNull().references(() => userProfiles.id),

  agreementVersion: varchar('agreement_version', { length: 20 }).notNull(),
  agreementTextHash: varchar('agreement_text_hash', { length: 64 }).notNull(), // sha256 hex
  agreementPdfStoragePath: text('agreement_pdf_storage_path').notNull(),

  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  acceptedIp: inet('accepted_ip'),
  signaturePngStoragePath: text('signature_png_storage_path').notNull(),

  payerTaxRegistrationAttested: boolean('payer_tax_registration_attested').notNull().default(false),
  recipientTaxRegistrationAttested: boolean('recipient_tax_registration_attested').notNull().default(false),

  status: icPayoutAuthorizationStatusEnum('status').notNull().default('active'),

  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const icPayoutAuthorizationsRelations = relations(icPayoutAuthorizations, ({ one }) => ({
  user: one(userProfiles, { fields: [icPayoutAuthorizations.userId], references: [userProfiles.id] }),
  agency: one(agencies, { fields: [icPayoutAuthorizations.agencyId], references: [agencies.id] }),
}))

export type IcPayoutAuthorization = typeof icPayoutAuthorizations.$inferSelect
export type NewIcPayoutAuthorization = typeof icPayoutAuthorizations.$inferInsert
