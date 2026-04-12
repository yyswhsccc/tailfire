/**
 * User Profiles Schema
 *
 * Extends Supabase auth.users with application-specific user data.
 * Each user belongs to exactly one agency.
 */

import { pgTable, pgEnum, uuid, varchar, boolean, timestamp, text, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum('user_role', [
  'admin',  // Full CRUD + platform settings
  'user',   // Full CRUD on own items, read-only on agency items
])

export const userStatusEnum = pgEnum('user_status', [
  'active',   // Can login and access all features
  'pending',  // Invited, awaiting first login (limited access)
  'locked',   // Security lockout - cannot login
])

// ============================================================================
// TABLE: user_profiles
// ============================================================================

export const userProfiles = pgTable('user_profiles', {
  // Primary Key - matches auth.users.id
  id: uuid('id').primaryKey(),

  // Agency Association (required - single agency model)
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'restrict' }),

  // User Information (synced from auth.users or set manually)
  email: varchar('email', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),

  // Role & Permissions
  role: userRoleEnum('role').default('user').notNull(),

  // Status
  isActive: boolean('is_active').default(true).notNull(),
  status: userStatusEnum('status').default('active').notNull(),

  // Invitation/Lock Tracking
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  invitedBy: uuid('invited_by'),  // Self-reference handled by migration FK constraint
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedReason: text('locked_reason'),

  // Activity Tracking
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  // Avatar & Public Profile
  avatarUrl: text('avatar_url'),
  avatarStoragePath: text('avatar_storage_path'), // R2 path for deletion (server-only)
  bio: text('bio'),
  publicPhone: varchar('public_phone', { length: 50 }),
  designations: varchar('designations', { length: 255 }),
  jobTitle: varchar('job_title', { length: 100 }).default('Travel Advisor'),
  phoneExtension: varchar('phone_extension', { length: 20 }),
  officeAddress: jsonb('office_address'), // Nullable, no default

  // Social Media Links (default empty object)
  socialMediaLinks: jsonb('social_media_links').default({}),

  // Emergency Contact
  emergencyContactName: varchar('emergency_contact_name', { length: 255 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 50 }),

  // Platform Settings (default empty objects)
  emailSignatureConfig: jsonb('email_signature_config').default({}),
  platformPreferences: jsonb('platform_preferences').default({}),

  // User Timezone (IANA format, e.g., 'America/Toronto')
  timezone: varchar('timezone', { length: 64 }),

  // Licensing & Commission (default empty objects)
  licensingInfo: jsonb('licensing_info').default({}),
  commissionSettings: jsonb('commission_settings').default({}),

  // Public Profile Visibility (opt-in for B2C directory)
  isPublicProfile: boolean('is_public_profile').default(false).notNull(),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  agency: one(agencies, {
    fields: [userProfiles.agencyId],
    references: [agencies.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type UserProfile = typeof userProfiles.$inferSelect
export type NewUserProfile = typeof userProfiles.$inferInsert
export type UserRole = typeof userRoleEnum.enumValues[number]
export type UserStatus = typeof userStatusEnum.enumValues[number]
