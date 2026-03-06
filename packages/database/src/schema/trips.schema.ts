/**
 * Trip Management Schema
 *
 * Implements the Trip and Traveler system with itineraries and logistics groups.
 * Based on ULTIMATE_TAILFIRE_DATA_MODEL.md (lines 256-677)
 */

import { pgTable, uuid, varchar, text, date, decimal, boolean, timestamp, pgEnum, integer, jsonb, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { contacts } from './contacts.schema'
import { itineraryDays } from './itinerary-days.schema'
import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const tripTypeEnum = pgEnum('trip_type', [
  'leisure',
  'business',
  'group',
  'honeymoon',
  'corporate',
  'custom'
])

export const tripStatusEnum = pgEnum('trip_status', [
  'draft',
  'quoted',
  'booked',
  'in_progress',
  'completed',
  'cancelled',
  'inbound'  // Incoming leads without assigned owner
])

export const travelerTypeEnum = pgEnum('traveler_type', [
  'adult',
  'child',
  'infant'
])

export const travelerRoleEnum = pgEnum('traveler_role', [
  'primary_contact',
  'full_access',
  'limited_access'
])

export const travelerGroupTypeEnum = pgEnum('traveler_group_type', [
  'room',
  'dining',
  'activity',
  'transfer',
  'custom'
])

export const itineraryStatusEnum = pgEnum('itinerary_status', [
  'draft',
  'proposing',  // was 'presented' - ready for client review
  'approved',   // was 'selected' - client approved this option
  'archived',   // was 'rejected' - no longer active
  'declined'    // client explicitly declined the proposal
])

export const activityEntityTypeEnum = pgEnum('activity_entity_type', [
  'trip',
  'trip_traveler',
  'itinerary',
  'contact',
  'user',
  // Phase 1 audit logging expansion (2024-12-09)
  'activity',
  'booking',
  'installment',
  'activity_document',
  'contact_document',
  'booking_document',
  'activity_media',
  'trip_media',
  'trip_group',
  'contact_loyalty_program',
  'loyalty_program',
])

export const activityActionEnum = pgEnum('activity_action', [
  'created',
  'updated',
  'deleted',
  'status_changed',
  'published',
  'unpublished',
  'moved_to_group',
  'removed_from_group',
])

export const pricingVisibilityEnum = pgEnum('pricing_visibility', [
  'show_all',
  'hide_all',
  'travelers_only'
])

export const itineraryStyleEnum = pgEnum('itinerary_style', [
  'side_by_side',
  'stacked',
  'compact'
])

// ============================================================================
// TABLE: trips
// ============================================================================

export const trips = pgTable('trips', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (required for RLS)
  agencyId: uuid('agency_id').notNull(),
  branchId: uuid('branch_id'), // Phase 2 - Multi-branch support

  // Ownership (nullable for 'inbound' trips without assigned owner)
  ownerId: uuid('owner_id'), // Primary advisor (FK to users) - NULL allowed for inbound leads

  // Basic Information
  name: varchar('name', { length: 255 }).notNull(), // "Paris Honeymoon 2026"
  description: text('description'),
  tripType: tripTypeEnum('trip_type'),

  // Dates
  startDate: date('start_date'),
  endDate: date('end_date'),
  bookingDate: date('booking_date'),

  // Status
  status: tripStatusEnum('status').default('draft').notNull(),

  // Primary Contact
  primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),

  // Reference Numbers
  referenceNumber: varchar('reference_number', { length: 100 }),
  externalReference: varchar('external_reference', { length: 255 }),

  // Financial
  currency: varchar('currency', { length: 3 }).default('CAD'), // ISO 4217
  estimatedTotalCost: decimal('estimated_total_cost', { precision: 12, scale: 2 }),

  // Metadata
  tags: text('tags').array(),
  customFields: jsonb('custom_fields'), // Flexible JSON storage

  // Timezone (Phase 3.5 - Date/Time Management)
  timezone: varchar('timezone', { length: 64 }), // IANA timezone identifier (e.g., 'America/Toronto')

  // Trip Settings
  pricingVisibility: pricingVisibilityEnum('pricing_visibility').default('show_all'),
  allowPdfDownloads: boolean('allow_pdf_downloads').default(true).notNull(),
  itineraryStyle: itineraryStyleEnum('itinerary_style').default('side_by_side'),
  calendarDisplayMode: varchar('calendar_display_mode', { length: 20 }).default('trip').notNull(),

  // Settings
  isArchived: boolean('is_archived').default(false).notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  shareToken: varchar('share_token', { length: 64 }),
  tripGroupId: uuid('trip_group_id'),

  // Client's preferred itinerary selection (multi-itinerary proposals)
  // FK constraint defined in migration SQL (not inline — avoids circular type reference with itineraries table)
  clientSelectedItineraryId: uuid('client_selected_itinerary_id'),

  // Commission fee rate override (nullable — when NULL, uses agency_settings.commission_fee_rate)
  commissionFeeRateOverride: decimal('commission_fee_rate_override', { precision: 5, scale: 2 }),

  // Cover Photo (denormalized for quick access - synced from trip_media)
  coverPhotoUrl: text('cover_photo_url'),

  // Cancellation Tracking
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  cancelledBy: uuid('cancelled_by'),

  // Status Transition Tracking
  statusAutoTransitionedAt: timestamp('status_auto_transitioned_at', { withTimezone: true }),
  lastStatusChangeAt: timestamp('last_status_change_at', { withTimezone: true }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
  updatedBy: uuid('updated_by'), // FK to users
})

// ============================================================================
// TABLE: trip_groups (trip collections/folders)
// ============================================================================

export const tripGroups = pgTable('trip_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
})

// ============================================================================
// TABLE: trip_collaborators
// ============================================================================

export const tripCollaborators = pgTable('trip_collaborators', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(), // FK to users

  // Commission Split
  commissionPercentage: decimal('commission_percentage', { precision: 5, scale: 2 }).notNull(), // 30.00 = 30%

  // Role
  role: varchar('role', { length: 50 }), // 'lead', 'support', 'specialist'

  // Status
  isActive: boolean('is_active').default(true).notNull(),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
}, (table) => ({
  // Constraint: User can only be added as collaborator once per trip
  uniqueCollaborator: unique('unique_trip_collaborator').on(table.tripId, table.userId)
}))

// ============================================================================
// TABLE: trip_travelers
// ============================================================================

export const tripTravelers = pgTable('trip_travelers', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),

  // Traveler Role (Sprint 2.1 Phase 3)
  role: travelerRoleEnum('role').default('limited_access').notNull(),

  // Primary Traveler Flag (kept during migration for backward compatibility)
  isPrimaryTraveler: boolean('is_primary_traveler').default(false).notNull(),

  // Traveler Type
  travelerType: travelerTypeEnum('traveler_type').default('adult').notNull(),

  // Contact Snapshot (preserved data at booking time)
  contactSnapshot: jsonb('contact_snapshot'), // {firstName, lastName, email, phone, passport, etc.}

  // Emergency Contact (flexible design)
  emergencyContactId: uuid('emergency_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  emergencyContactInline: jsonb('emergency_contact_inline'), // {name, phone, relationship, email}

  // Traveler Group Assignment
  travelerGroupId: uuid('traveler_group_id'), // FK to traveler_groups (added after table creation)

  // Special Requirements
  specialRequirements: text('special_requirements'),

  // Ordering
  sequenceOrder: integer('sequence_order').default(0),

  // Snapshot Tracking
  snapshotUpdatedAt: timestamp('snapshot_updated_at', { withTimezone: true }).defaultNow(),
  contactDeletedAt: timestamp('contact_deleted_at', { withTimezone: true }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
})

// ============================================================================
// TABLE: traveler_groups
// ============================================================================

export const travelerGroups = pgTable('traveler_groups', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Key
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),

  // Group Information
  name: varchar('name', { length: 255 }).notNull(), // "Room 401", "Dinner Table 3"
  groupType: travelerGroupTypeEnum('group_type').notNull(),
  description: text('description'),

  // Ordering
  sequenceOrder: integer('sequence_order'),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
  updatedBy: uuid('updated_by'), // FK to users
})

// ============================================================================
// TABLE: traveler_group_members
// ============================================================================

export const travelerGroupMembers = pgTable('traveler_group_members', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  travelerGroupId: uuid('traveler_group_id').notNull().references(() => travelerGroups.id, { onDelete: 'cascade' }),
  tripTravelerId: uuid('trip_traveler_id').notNull().references(() => tripTravelers.id, { onDelete: 'cascade' }),

  // Role
  role: varchar('role', { length: 100 }), // 'room lead', 'table captain', etc.

  // Notes
  notes: text('notes'),

  // Audit Fields
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  addedBy: uuid('added_by'), // FK to users
}, (table) => ({
  // Constraint: Traveler can only be in a group once
  uniqueGroupMember: unique('unique_traveler_group_member').on(table.travelerGroupId, table.tripTravelerId)
}))

// ============================================================================
// TABLE: itineraries
// ============================================================================

export const itineraries = pgTable('itineraries', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Key
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),

  // Agency Association (denormalized for RLS)
  agencyId: uuid('agency_id'),

  // Itinerary Information
  name: varchar('name', { length: 255 }).notNull(), // "Option A - Luxury", "Option B - Budget"
  description: text('description'),
  coverPhoto: text('cover_photo'), // Optional cover photo URL (TERN pattern)
  overview: text('overview'), // Rich text overview statement (TERN pattern)
  startDate: date('start_date'), // Can override trip start date (TERN pattern)
  endDate: date('end_date'), // Can override trip end date (TERN pattern)

  // Destinations (geolocation)
  primaryDestinationName: varchar('primary_destination_name', { length: 255 }),
  primaryDestinationLat: decimal('primary_destination_lat', { precision: 9, scale: 6 }),
  primaryDestinationLng: decimal('primary_destination_lng', { precision: 10, scale: 6 }),
  secondaryDestinationName: varchar('secondary_destination_name', { length: 255 }),
  secondaryDestinationLat: decimal('secondary_destination_lat', { precision: 9, scale: 6 }),
  secondaryDestinationLng: decimal('secondary_destination_lng', { precision: 10, scale: 6 }),

  // Status
  status: itineraryStatusEnum('status').default('draft').notNull(),
  isSelected: boolean('is_selected').default(false).notNull(),

  // Financial
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),

  // Ordering
  sequenceOrder: integer('sequence_order').default(0),

  // Versioning (publish-gated itinerary content)
  currentVersion: integer('current_version').notNull().default(0),
  publishedVersion: integer('published_version'),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  hasUnpublishedChanges: boolean('has_unpublished_changes').notNull().default(false),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// TABLE: itinerary_versions (publish-gated snapshots)
// ============================================================================

export const itineraryVersions = pgTable('itinerary_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  itineraryId: uuid('itinerary_id').notNull().references(() => itineraries.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  changeSummary: text('change_summary'),
  publishedBy: uuid('published_by').references(() => userProfiles.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueVersion: unique().on(table.itineraryId, table.versionNumber),
}))

// ============================================================================
// TABLE: activity_logs
// ============================================================================

export const activityLogs = pgTable('activity_logs', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Entity Information (polymorphic)
  entityType: activityEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(), // ID of the entity (trip, traveler, etc.)

  // Action
  action: activityActionEnum('action').notNull(),

  // Actor (who performed the action)
  actorId: uuid('actor_id'), // FK to users (nullable for system actions)
  actorType: varchar('actor_type', { length: 50 }), // 'user', 'system', 'api'

  // Change Details
  description: text('description'), // Human-readable description
  metadata: jsonb('metadata'), // Flexible JSON for change details, previous/new values, etc.

  // Optional trip association (for filtering activity by trip)
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const tripsRelations = relations(trips, ({ one, many }) => ({
  // Primary Contact
  primaryContact: one(contacts, {
    fields: [trips.primaryContactId],
    references: [contacts.id]
  }),
  // Collaborators
  collaborators: many(tripCollaborators),
  // Travelers
  travelers: many(tripTravelers),
  // Traveler Groups
  travelerGroups: many(travelerGroups),
  // Itineraries
  itineraries: many(itineraries),
  // Trip Group
  tripGroup: one(tripGroups, {
    fields: [trips.tripGroupId],
    references: [tripGroups.id]
  }),
  // Client's selected itinerary (multi-proposal)
  clientSelectedItinerary: one(itineraries, {
    fields: [trips.clientSelectedItineraryId],
    references: [itineraries.id]
  }),
  // Media relation defined in trip-media.schema.ts to avoid circular imports
}))

export const tripGroupsRelations = relations(tripGroups, ({ many }) => ({
  trips: many(trips),
}))

export const tripCollaboratorsRelations = relations(tripCollaborators, ({ one }) => ({
  trip: one(trips, {
    fields: [tripCollaborators.tripId],
    references: [trips.id]
  }),
}))

export const tripTravelersRelations = relations(tripTravelers, ({ one, many }) => ({
  trip: one(trips, {
    fields: [tripTravelers.tripId],
    references: [trips.id]
  }),
  contact: one(contacts, {
    fields: [tripTravelers.contactId],
    references: [contacts.id]
  }),
  emergencyContact: one(contacts, {
    fields: [tripTravelers.emergencyContactId],
    references: [contacts.id]
  }),
  travelerGroup: one(travelerGroups, {
    fields: [tripTravelers.travelerGroupId],
    references: [travelerGroups.id]
  }),
  groupMemberships: many(travelerGroupMembers),
}))

export const travelerGroupsRelations = relations(travelerGroups, ({ one, many }) => ({
  trip: one(trips, {
    fields: [travelerGroups.tripId],
    references: [trips.id]
  }),
  members: many(travelerGroupMembers),
  travelers: many(tripTravelers),
}))

export const travelerGroupMembersRelations = relations(travelerGroupMembers, ({ one }) => ({
  travelerGroup: one(travelerGroups, {
    fields: [travelerGroupMembers.travelerGroupId],
    references: [travelerGroups.id]
  }),
  tripTraveler: one(tripTravelers, {
    fields: [travelerGroupMembers.tripTravelerId],
    references: [tripTravelers.id]
  }),
}))

export const itinerariesRelations = relations(itineraries, ({ one, many }) => ({
  trip: one(trips, {
    fields: [itineraries.tripId],
    references: [trips.id]
  }),
  days: many(itineraryDays),
  versions: many(itineraryVersions),
}))

export const itineraryVersionsRelations = relations(itineraryVersions, ({ one }) => ({
  itinerary: one(itineraries, {
    fields: [itineraryVersions.itineraryId],
    references: [itineraries.id]
  }),
}))

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  trip: one(trips, {
    fields: [activityLogs.tripId],
    references: [trips.id]
  }),
}))
