import {
  pgTable, uuid, varchar, jsonb, date, timestamp, boolean, smallint, bigint, customType, unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() { return 'bytea' },
})

export const icTaxProfiles = pgTable('ic_tax_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull().references(() => agencies.id),
  userId: uuid('user_id').notNull().references(() => userProfiles.id),

  legalName: varchar('legal_name', { length: 255 }).notNull(),
  domicileAddress: jsonb('domicile_address').notNull(),
  domicileProvince: varchar('domicile_province', { length: 2 }).notNull(),
  isCorporation: boolean('is_corporation').notNull().default(false),

  // Encrypted SIN (sole prop) or BN (incorporated)
  sinOrBnEncrypted: bytea('sin_or_bn_encrypted'),
  encryptionKeyVersion: smallint('encryption_key_version'),
  sinOrBnMask: varchar('sin_or_bn_mask', { length: 20 }),

  // GST/HST registration
  gstHstRegistered: boolean('gst_hst_registered').notNull().default(false),
  gstHstNumber: varchar('gst_hst_number', { length: 40 }),
  gstHstEffectiveFrom: date('gst_hst_effective_from'),
  gstHstEffectiveTo: date('gst_hst_effective_to'),

  // Disbursement policy
  autoDisburse: boolean('auto_disburse').notNull().default(false),
  approvalCeilingCents: bigint('approval_ceiling_cents', { mode: 'number' }),

  // Most-recent active RCTI authorization (FK added later, in Task 5's migration)
  rctiAuthorizationId: uuid('rcti_authorization_id'),

  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueUserAgency: unique('unique_ic_tax_profiles_agency_user').on(t.agencyId, t.userId),
}))

export const icTaxProfilesRelations = relations(icTaxProfiles, ({ one }) => ({
  user: one(userProfiles, { fields: [icTaxProfiles.userId], references: [userProfiles.id] }),
  agency: one(agencies, { fields: [icTaxProfiles.agencyId], references: [agencies.id] }),
}))

export type IcTaxProfile = typeof icTaxProfiles.$inferSelect
export type NewIcTaxProfile = typeof icTaxProfiles.$inferInsert
