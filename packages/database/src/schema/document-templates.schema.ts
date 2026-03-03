/**
 * Document Templates Schema
 *
 * Block-based document template system with Handlebars rendering.
 * Supports system templates (agency_id IS NULL) and per-agency customizations.
 * Templates can produce email and/or PDF output from a single block source.
 */

import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { agencies } from './agencies.schema'

// ============================================================================
// TABLE: document_templates
// ============================================================================

/**
 * Document Templates Table
 * Stores block-based templates with compiled Handlebars output for email/PDF
 */
export const documentTemplates = pgTable('document_templates', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (null for system templates)
  agencyId: uuid('agency_id').references(() => agencies.id),

  // Parent-child versioning (for agency overrides of system templates)
  parentId: uuid('parent_id'),
  parentVersion: integer('parent_version'),

  // Template Identity
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull(),

  // Block Editor Content (GrapesJS JSON)
  blocksJson: jsonb('blocks_json').notNull().default({ blocks: [] }),

  // Compiled Output Templates
  emailHtml: text('email_html'),
  emailCss: text('email_css'),
  pdfHtml: text('pdf_html'),
  pdfCss: text('pdf_css'),
  subjectTemplate: text('subject_template'),
  textTemplate: text('text_template'),

  // Variable Metadata (list of supported variables for documentation)
  variables: jsonb('variables'),

  // Output Configuration
  outputTypes: text('output_types').array().notNull().default(sql`'{email}'`),

  // Status & Versioning
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),

  // Audit Fields
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agencyIdIdx: index('idx_document_templates_agency_id').on(table.agencyId),
  categoryIdx: index('idx_document_templates_category').on(table.category),
  statusIdx: index('idx_document_templates_status').on(table.status),
  parentIdIdx: index('idx_document_templates_parent_id').on(table.parentId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const documentTemplatesRelations = relations(documentTemplates, ({ one }) => ({
  agency: one(agencies, {
    fields: [documentTemplates.agencyId],
    references: [agencies.id],
  }),
  parent: one(documentTemplates, {
    fields: [documentTemplates.parentId],
    references: [documentTemplates.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type DocumentTemplate = typeof documentTemplates.$inferSelect
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert
