/**
 * API Credentials Schema
 *
 * Secure storage for API credentials with versioning and rotation support.
 * Credentials are encrypted using AES-256-GCM.
 */

import { pgTable, uuid, varchar, jsonb, integer, boolean, timestamp, pgEnum, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ============================================================================
// ENUMS
// ============================================================================

export const apiProviderEnum = pgEnum('api_provider', [
  'supabase_storage',
  'cloudflare_r2',
  'backblaze_b2',
  'unsplash',
  'aerodatabox',
  'amadeus',
  'amadeus_hotels',
  'google_places',
  'booking_com',
  'open_ai',
])

export const credentialStatusEnum = pgEnum('credential_status', [
  'active',
  'expired',
  'revoked'
])

// ============================================================================
// TYPES
// ============================================================================

/**
 * Structure of encrypted credentials stored in JSONB
 * All values are base64-encoded strings
 */
export interface EncryptedCredentials {
  iv: string        // Initialization vector (base64)
  ciphertext: string // Encrypted data (base64)
  authTag: string   // Authentication tag for GCM (base64)
}

// ============================================================================
// TABLE: api_credentials
// ============================================================================

export const apiCredentials = pgTable('api_credentials', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Parent reference for versioning
  // NULL for version 1, set to parent credential ID for rotations
  parentId: uuid('parent_id').references((): any => apiCredentials.id, { onDelete: 'set null' }),

  // Provider & Identity
  provider: apiProviderEnum('provider').notNull(),
  name: varchar('name', { length: 255 }).notNull(),

  // Encrypted credentials (AES-256-GCM)
  // Structure: {iv: string, ciphertext: string, authTag: string}
  encryptedCredentials: jsonb('encrypted_credentials').$type<EncryptedCredentials>().notNull(),

  // Versioning
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  status: credentialStatusEnum('status').notNull().default('active'),

  // Rotation tracking
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  // Audit fields (nullable until auth system ready)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users (will be added later)
  updatedBy: uuid('updated_by'), // FK to users (will be added later)
}, (table) => ({
  // Constraints
  versionMustBePositive: check('version_must_be_positive', sql`${table.version} >= 1`),
  // Exclusion constraint: only one active credential per provider
  // This is created in migration as: EXCLUDE (provider WITH =) WHERE (is_active = true)
  // Drizzle doesn't support exclusion constraints in schema definition
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const apiCredentialsRelations = relations(apiCredentials, ({ one, many }) => ({
  // Parent credential (for versioning)
  parent: one(apiCredentials, {
    fields: [apiCredentials.parentId],
    references: [apiCredentials.id],
    relationName: 'parent'
  }),
  // Child credentials (rotated versions)
  children: many(apiCredentials, {
    relationName: 'parent'
  }),
}))
