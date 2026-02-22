/**
 * Contact Management Schema
 *
 * Implements the Contact CRM system with relationships and groups.
 * Based on ULTIMATE_TAILFIRE_DATA_MODEL.md (lines 4020-4337)
 */

import { pgTable, uuid, varchar, text, date, decimal, boolean, timestamp, pgEnum, check, unique, jsonb } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ============================================================================
// ENUMS
// ============================================================================

export const contactTypeEnum = pgEnum('contact_type_enum', [
  'lead',
  'client'
])

export const contactStatusEnum = pgEnum('contact_status_enum', [
  'prospecting',
  'quoted',
  'booked',
  'traveling',
  'returned',
  'awaiting_next',
  'inactive'
])

export const contactRelationshipCategoryEnum = pgEnum('contact_relationship_category', [
  'family',
  'business',
  'travel_companions',
  'group',
  'other',
  'custom'
])

export const contactGroupTypeEnum = pgEnum('contact_group_type', [
  'family',
  'corporate',
  'wedding',
  'friends',
  'custom'
])

// ============================================================================
// TABLE: contacts
// ============================================================================

export const contacts = pgTable('contacts', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (nullable - single agency model)
  agencyId: uuid('agency_id'),
  // branchId: uuid('branch_id'), // Phase 2 - Multi-branch support

  // Ownership (NULL = agency-wide contact, non-NULL = user-owned)
  ownerId: uuid('owner_id'),

  // Basic Information (names - flexible, at least one required via constraint)
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),

  // Legal Name (for passports, legal documents)
  legalFirstName: text('legal_first_name'),
  legalLastName: text('legal_last_name'),
  middleName: text('middle_name'),

  // Display Name
  preferredName: text('preferred_name'),

  // Name Elements
  prefix: varchar('prefix', { length: 10 }), // Mr., Mrs., Ms., Dr., Mx.
  suffix: varchar('suffix', { length: 10 }), // Jr., Sr., III, PhD

  // LGBTQ+ Inclusive Fields
  gender: varchar('gender', { length: 50 }), // male, female, non-binary, prefer_not_to_say
  pronouns: varchar('pronouns', { length: 50 }), // she/her, he/him, they/them, ze/zir
  maritalStatus: varchar('marital_status', { length: 50 }), // single, married, domestic_partnership, etc.

  // Contact Information
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  dateOfBirth: date('date_of_birth'),

  // Passport Information
  passportNumber: varchar('passport_number', { length: 50 }),
  passportExpiry: date('passport_expiry'),
  passportCountry: varchar('passport_country', { length: 3 }), // ISO 3166-1 alpha-3
  passportIssueDate: date('passport_issue_date'),
  nationality: varchar('nationality', { length: 3 }), // ISO 3166-1 alpha-3

  // TSA Credentials
  redressNumber: varchar('redress_number', { length: 20 }),
  knownTravelerNumber: varchar('known_traveler_number', { length: 20 }), // TSA PreCheck, Global Entry, NEXUS

  // Address Fields
  addressLine1: varchar('address_line1', { length: 255 }),
  addressLine2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 100 }), // State/Province
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 3 }), // ISO 3166-1 alpha-3

  // Special Requirements
  dietaryRequirements: text('dietary_requirements'),
  mobilityRequirements: text('mobility_requirements'),

  // Travel Preferences
  seatPreference: varchar('seat_preference', { length: 20 }), // aisle, window, middle, no_preference
  cabinPreference: varchar('cabin_preference', { length: 20 }), // economy, premium_economy, business, first
  floorPreference: varchar('floor_preference', { length: 20 }), // high, low, no_preference
  travelPreferences: jsonb('travel_preferences').$type<Record<string, any>>().default({}), // JSONB for extensibility

  // Lifecycle & Status (Phase 2)
  contactType: contactTypeEnum('contact_type').default('lead').notNull(),
  contactStatus: contactStatusEnum('contact_status').default('prospecting').notNull(),
  becameClientAt: timestamp('became_client_at', { withTimezone: true }),
  firstBookingDate: date('first_booking_date'),
  lastTripReturnDate: date('last_trip_return_date'),

  // Marketing Consent (Phase 3)
  marketingEmailOptIn: boolean('marketing_email_opt_in').default(false),
  marketingEmailOptInAt: timestamp('marketing_email_opt_in_at', { withTimezone: true }),
  marketingSmsOptIn: boolean('marketing_sms_opt_in').default(false),
  marketingSmsOptInAt: timestamp('marketing_sms_opt_in_at', { withTimezone: true }),
  marketingPhoneOptIn: boolean('marketing_phone_opt_in').default(false),
  marketingPhoneOptInAt: timestamp('marketing_phone_opt_in_at', { withTimezone: true }),
  marketingOptInSource: text('marketing_opt_in_source'),
  marketingOptOutAt: timestamp('marketing_opt_out_at', { withTimezone: true }),
  marketingOptOutReason: text('marketing_opt_out_reason'),

  // Trust Account Balances (READ-ONLY, auto-computed)
  trustBalanceCad: decimal('trust_balance_cad', { precision: 12, scale: 2 }).default('0.00'),
  trustBalanceUsd: decimal('trust_balance_usd', { precision: 12, scale: 2 }).default('0.00'),

  // Metadata
  tags: text('tags').array(),
  isActive: boolean('is_active').default(true).notNull(),

  // Timezone (Phase 3.5 - Date/Time Management)
  timezone: varchar('timezone', { length: 64 }), // IANA timezone identifier (e.g., 'America/Toronto')

  // Portal Authentication
  portalUserId: uuid('portal_user_id'),
  portalInvitedAt: timestamp('portal_invited_at', { withTimezone: true }),
  portalInvitedBy: uuid('portal_invited_by'),
  portalActivatedAt: timestamp('portal_activated_at', { withTimezone: true }),

  // Photo (portal avatar)
  photoUrl: text('photo_url'),
  photoStoragePath: text('photo_storage_path'),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// TABLE: contact_relationships
// ============================================================================

export const contactRelationships = pgTable('contact_relationships', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (nullable - single agency model)
  agencyId: uuid('agency_id'),

  // Bidirectional Link
  contactId1: uuid('contact_id1').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  contactId2: uuid('contact_id2').notNull().references(() => contacts.id, { onDelete: 'cascade' }),

  // Asymmetric Labels
  labelForContact1: varchar('label_for_contact1', { length: 100 }), // "husband", "business partner"
  labelForContact2: varchar('label_for_contact2', { length: 100 }), // "wife", "client"

  // Category
  category: contactRelationshipCategoryEnum('category').default('other'),
  customLabel: varchar('custom_label', { length: 100 }),

  // Notes
  notes: text('notes'),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users (will be added later)
  updatedBy: uuid('updated_by'), // FK to users (will be added later)
}, (table) => ({
  // Constraints
  uniqueRelationship: unique('unique_contact_relationship').on(table.contactId1, table.contactId2),
  checkDifferentContacts: check('check_different_contacts', sql`${table.contactId1} != ${table.contactId2}`),
  // Bidirectional uniqueness: prevents both (A,B) and (B,A) from existing
  // This functional unique index ensures relationship uniqueness regardless of contact order
  // The index is created using raw SQL since Drizzle doesn't support functional indexes in schema
  // Migration SQL: CREATE UNIQUE INDEX unique_bidirectional_relationship ON contact_relationships (LEAST(contact_id1, contact_id2), GREATEST(contact_id1, contact_id2));
}))

// ============================================================================
// TABLE: contact_groups
// ============================================================================

export const contactGroups = pgTable('contact_groups', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (nullable - single agency model)
  agencyId: uuid('agency_id'),

  // Group Information
  name: varchar('name', { length: 255 }).notNull(), // "Smith Family", "Microsoft Sales Team"
  groupType: contactGroupTypeEnum('group_type').notNull(),
  description: text('description'),

  // Primary Contact
  primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),

  // Metadata
  tags: text('tags').array(),
  isActive: boolean('is_active').default(true).notNull(),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
  updatedBy: uuid('updated_by'), // FK to users
})

// ============================================================================
// TABLE: contact_group_members
// ============================================================================

export const contactGroupMembers = pgTable('contact_group_members', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  groupId: uuid('group_id').notNull().references(() => contactGroups.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),

  // Member Information
  role: varchar('role', { length: 100 }), // Flexible: 'primary', 'spouse', 'child', 'employee', etc.
  notes: text('notes'),

  // Audit Fields
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  addedBy: uuid('added_by'), // FK to users
}, (table) => ({
  // Constraint: Contact can only be in a group once
  uniqueGroupMember: unique('unique_contact_group_member').on(table.groupId, table.contactId)
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const contactsRelations = relations(contacts, ({ many }) => ({
  // Relationships where this contact is contact1
  relationshipsAsContact1: many(contactRelationships, {
    relationName: 'contact1'
  }),
  // Relationships where this contact is contact2
  relationshipsAsContact2: many(contactRelationships, {
    relationName: 'contact2'
  }),
  // Group memberships
  groupMemberships: many(contactGroupMembers),
  // Groups where this contact is primary
  primaryGroups: many(contactGroups),
}))

export const contactRelationshipsRelations = relations(contactRelationships, ({ one }) => ({
  contact1: one(contacts, {
    fields: [contactRelationships.contactId1],
    references: [contacts.id],
    relationName: 'contact1'
  }),
  contact2: one(contacts, {
    fields: [contactRelationships.contactId2],
    references: [contacts.id],
    relationName: 'contact2'
  }),
}))

export const contactGroupsRelations = relations(contactGroups, ({ one, many }) => ({
  primaryContact: one(contacts, {
    fields: [contactGroups.primaryContactId],
    references: [contacts.id]
  }),
  members: many(contactGroupMembers),
}))

export const contactGroupMembersRelations = relations(contactGroupMembers, ({ one }) => ({
  group: one(contactGroups, {
    fields: [contactGroupMembers.groupId],
    references: [contactGroups.id]
  }),
  contact: one(contacts, {
    fields: [contactGroupMembers.contactId],
    references: [contacts.id]
  }),
}))
