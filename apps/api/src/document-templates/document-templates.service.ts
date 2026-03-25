/**
 * Document Templates Service
 *
 * CRUD operations for document templates with agency-override resolution,
 * forking, and Handlebars rendering.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import { eq, and, or, isNull, desc, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { HandlebarsRendererService } from './handlebars-renderer.service'
import {
  TemplateContextBuilderService,
  type ContextParams,
} from './template-context-builder.service'
import type { CreateDocumentTemplateDto } from './dto/create-document-template.dto'
import type { UpdateDocumentTemplateDto } from './dto/update-document-template.dto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListTemplatesFilters {
  category?: string
  status?: string
  channel?: string
}

export interface RenderedDocumentTemplate {
  subject: string | null
  html: string | null
  pdfHtml: string | null
  text: string | null
  templateId: string
  templateSlug: string
  templateVersion: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentTemplatesService {
  private readonly logger = new Logger(DocumentTemplatesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly handlebars: HandlebarsRendererService,
    private readonly contextBuilder: TemplateContextBuilderService,
  ) {}

  // -------------------------------------------------------------------------
  // resolveTemplate — agency-override resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve a template by slug with agency-override logic.
   * Agency-specific templates (non-null agency_id) take priority over system templates.
   * Includes draft agency templates — use for authoring, preview, and editing flows.
   */
  async resolveTemplate(slug: string, agencyId: string) {
    const { documentTemplates } = this.db.schema

    const results = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, slug),
          eq(documentTemplates.isActive, true),
          or(
            eq(documentTemplates.agencyId, agencyId),
            isNull(documentTemplates.agencyId),
          ),
        ),
      )
      .orderBy(sql`${documentTemplates.agencyId} DESC NULLS LAST`)
      .limit(1)

    return results[0] ?? null
  }

  /**
   * Resolve a template for production rendering (Trip Orders, queue jobs).
   *
   * 3-tier resolution order (most specific first):
   *  1. User-level override:  slug + userId + status='published'
   *  2. Agency-level override: slug + agencyId + userId IS NULL + status='published'
   *  3. System default:        slug + agencyId IS NULL + userId IS NULL (any status)
   *
   * The userId parameter is optional — existing callers that pass only slug + agencyId
   * continue to receive the existing 2-tier (agency → system) behaviour.
   */
  async resolvePublishedTemplate(slug: string, agencyId: string, userId?: string) {
    const { documentTemplates } = this.db.schema

    // Tier 1 — user-level published override
    if (userId) {
      const [userRow] = await this.db.client
        .select()
        .from(documentTemplates)
        .where(
          and(
            eq(documentTemplates.slug, slug),
            eq(documentTemplates.isActive, true),
            eq(documentTemplates.userId, userId),
            eq(documentTemplates.status, 'published'),
          ),
        )
        .limit(1)

      if (userRow) return userRow
    }

    // Tier 2 — agency-level published override (userId must be null)
    const [agencyRow] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, slug),
          eq(documentTemplates.isActive, true),
          eq(documentTemplates.agencyId, agencyId),
          isNull(documentTemplates.userId),
          eq(documentTemplates.status, 'published'),
        ),
      )
      .limit(1)

    if (agencyRow) return agencyRow

    // Tier 3 — system default (agencyId IS NULL, userId IS NULL, any status)
    const [systemRow] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, slug),
          eq(documentTemplates.isActive, true),
          isNull(documentTemplates.agencyId),
          isNull(documentTemplates.userId),
        ),
      )
      .limit(1)

    return systemRow ?? null
  }

  // -------------------------------------------------------------------------
  // getById — get by UUID, scoped to agency + system templates
  // -------------------------------------------------------------------------

  async getById(id: string, agencyId: string) {
    const { documentTemplates } = this.db.schema

    const [row] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, id),
          or(
            eq(documentTemplates.agencyId, agencyId),
            isNull(documentTemplates.agencyId),
          ),
        ),
      )
      .limit(1)

    return row ?? null
  }

  // -------------------------------------------------------------------------
  // list — list all templates visible to agency (system + own), filtered
  // -------------------------------------------------------------------------

  async list(agencyId: string, filters: ListTemplatesFilters = {}) {
    const { documentTemplates } = this.db.schema

    const conditions = [
      eq(documentTemplates.isActive, true),
      or(
        eq(documentTemplates.agencyId, agencyId),
        isNull(documentTemplates.agencyId),
      ),
    ]

    if (filters.category) {
      conditions.push(eq(documentTemplates.category, filters.category))
    }

    if (filters.status) {
      conditions.push(eq(documentTemplates.status, filters.status))
    }

    if (filters.channel) {
      conditions.push(eq(documentTemplates.channel, filters.channel))
    }

    return this.db.client
      .select()
      .from(documentTemplates)
      .where(and(...conditions))
      .orderBy(desc(documentTemplates.updatedAt))
  }

  // -------------------------------------------------------------------------
  // create — insert new agency template
  // -------------------------------------------------------------------------

  async create(
    agencyId: string,
    dto: CreateDocumentTemplateDto,
    createdBy?: string,
  ) {
    const { documentTemplates } = this.db.schema

    const [row] = await this.db.client
      .insert(documentTemplates)
      .values({
        agencyId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        blocksJson: dto.blocksJson,
        emailHtml: dto.emailHtml,
        emailCss: dto.emailCss,
        pdfHtml: dto.pdfHtml,
        pdfCss: dto.pdfCss,
        subjectTemplate: dto.subjectTemplate,
        textTemplate: dto.textTemplate,
        variables: dto.variables,
        outputTypes: dto.outputTypes,
        createdBy,
      })
      .returning()

    this.logger.log(`Created document template: ${row!.slug} (${row!.id})`)
    return row!
  }

  // -------------------------------------------------------------------------
  // update — update template (system or agency-owned)
  // -------------------------------------------------------------------------

  async update(
    id: string,
    agencyId: string,
    dto: UpdateDocumentTemplateDto,
    updatedBy?: string,
  ) {
    const { documentTemplates } = this.db.schema

    // Verify template exists; system templates (agencyId=null) are editable by any admin
    const [existing] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    // System templates can be edited by any authenticated admin
    // Agency templates must belong to the caller's agency
    if (existing.agencyId && existing.agencyId !== agencyId) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    // Build update payload
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy,
      version: existing.version + 1,
    }

    if (dto.slug !== undefined) updateData.slug = dto.slug
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.category !== undefined) updateData.category = dto.category
    if (dto.blocksJson !== undefined) updateData.blocksJson = dto.blocksJson
    if (dto.emailHtml !== undefined) updateData.emailHtml = dto.emailHtml
    if (dto.emailCss !== undefined) updateData.emailCss = dto.emailCss
    if (dto.pdfHtml !== undefined) updateData.pdfHtml = dto.pdfHtml
    if (dto.pdfCss !== undefined) updateData.pdfCss = dto.pdfCss
    if (dto.subjectTemplate !== undefined) updateData.subjectTemplate = dto.subjectTemplate
    if (dto.textTemplate !== undefined) updateData.textTemplate = dto.textTemplate
    if (dto.variables !== undefined) updateData.variables = dto.variables
    if (dto.outputTypes !== undefined) updateData.outputTypes = dto.outputTypes

    // Set publishedAt when status becomes 'published'
    if (dto.status !== undefined) {
      updateData.status = dto.status
      if (dto.status === 'published' && existing.status !== 'published') {
        updateData.publishedAt = new Date()
      }
    }

    const [updated] = await this.db.client
      .update(documentTemplates)
      .set(updateData)
      .where(eq(documentTemplates.id, id))
      .returning()

    this.logger.log(`Updated document template: ${updated!.slug} (${updated!.id}) v${updated!.version}`)
    return updated!
  }

  // -------------------------------------------------------------------------
  // softDelete — set is_active = false (rejects system templates)
  // -------------------------------------------------------------------------

  async softDelete(id: string, agencyId: string) {
    const { documentTemplates } = this.db.schema

    const [existing] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    if (!existing.agencyId) {
      throw new ForbiddenException('Cannot delete system templates')
    }

    if (existing.agencyId !== agencyId) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    await this.db.client
      .update(documentTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentTemplates.id, id))

    this.logger.log(`Soft-deleted document template: ${existing.slug} (${id})`)
  }

  // -------------------------------------------------------------------------
  // fork — deep-copy a system template for the agency
  // -------------------------------------------------------------------------

  async fork(templateId: string, agencyId: string, userId: string) {
    const { documentTemplates } = this.db.schema

    // Load the source template
    const [source] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, templateId))
      .limit(1)

    if (!source) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // Check if agency already has a fork of that slug (active or inactive)
    const [existingFork] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, source.slug),
          eq(documentTemplates.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (existingFork && existingFork.isActive) {
      throw new ConflictException(
        `Agency already has a template with slug "${source.slug}". Edit the existing template instead.`,
      )
    }

    // If an inactive fork exists, reactivate and update it from the source
    if (existingFork && !existingFork.isActive) {
      const [reactivated] = await this.db.client
        .update(documentTemplates)
        .set({
          parentId: source.id,
          parentVersion: source.version,
          name: source.name,
          description: source.description,
          category: source.category,
          blocksJson: source.blocksJson,
          emailHtml: source.emailHtml,
          emailCss: source.emailCss,
          pdfHtml: source.pdfHtml,
          pdfCss: source.pdfCss,
          subjectTemplate: source.subjectTemplate,
          textTemplate: source.textTemplate,
          variables: source.variables,
          outputTypes: source.outputTypes,
          status: 'draft',
          version: existingFork.version + 1,
          isActive: true,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(documentTemplates.id, existingFork.id))
        .returning()

      this.logger.log(
        `Reactivated fork: ${reactivated!.slug} (${reactivated!.id}) from parent ${source.id} v${source.version}`,
      )
      return reactivated!
    }

    // Deep-copy the template (no existing fork)
    const [forked] = await this.db.client
      .insert(documentTemplates)
      .values({
        agencyId,
        parentId: source.id,
        parentVersion: source.version,
        slug: source.slug,
        name: source.name,
        description: source.description,
        category: source.category,
        blocksJson: source.blocksJson,
        emailHtml: source.emailHtml,
        emailCss: source.emailCss,
        pdfHtml: source.pdfHtml,
        pdfCss: source.pdfCss,
        subjectTemplate: source.subjectTemplate,
        textTemplate: source.textTemplate,
        variables: source.variables,
        outputTypes: source.outputTypes,
        status: 'draft',
        version: 1,
        createdBy: userId,
      })
      .returning()

    this.logger.log(
      `Forked document template: ${forked!.slug} (${forked!.id}) from parent ${source.id} v${source.version}`,
    )
    return forked!
  }

  // -------------------------------------------------------------------------
  // forkTemplate — deep-copy a template as a user-level draft
  // -------------------------------------------------------------------------

  /**
   * Fork a template for a specific user.
   * Creates a copy in 'draft' status with user_id set.
   * The user must publish the fork for it to be picked up by resolvePublishedTemplate.
   */
  async forkTemplate(templateId: string, userId: string, agencyId: string): Promise<any> {
    const { documentTemplates } = this.db.schema

    // 1. Load source template by ID
    const [source] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, templateId))
      .limit(1)

    // 2. Check it exists
    if (!source) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // 3. Check no existing active fork for this user + slug
    const [existingFork] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, source.slug),
          eq(documentTemplates.userId, userId),
          eq(documentTemplates.isActive, true),
        ),
      )
      .limit(1)

    if (existingFork) {
      throw new ConflictException(
        `User already has an active template with slug "${source.slug}". Edit the existing fork instead.`,
      )
    }

    // 4. Clone: insert new row with user_id=userId, parent_id, status='draft'
    const [forked] = await this.db.client
      .insert(documentTemplates)
      .values({
        agencyId,
        userId,
        parentId: source.id,
        parentVersion: source.version,
        slug: source.slug,
        name: source.name,
        description: source.description,
        category: source.category,
        channel: source.channel,
        blocksJson: source.blocksJson,
        emailHtml: source.emailHtml,
        emailCss: source.emailCss,
        pdfHtml: source.pdfHtml,
        pdfCss: source.pdfCss,
        subjectTemplate: source.subjectTemplate,
        textTemplate: source.textTemplate,
        smsTemplate: source.smsTemplate,
        formJson: source.formJson,
        variables: source.variables,
        outputTypes: source.outputTypes,
        status: 'draft',
        version: 1,
        createdBy: userId,
      })
      .returning()

    this.logger.log(
      `User fork created: ${forked!.slug} (${forked!.id}) by user ${userId} from parent ${source.id} v${source.version}`,
    )

    // 5. Return the fork
    return forked!
  }

  // -------------------------------------------------------------------------
  // deleteFork — hard-delete a user's own fork
  // -------------------------------------------------------------------------

  /**
   * Delete a user-owned fork (user_id must match).
   * Throws if the template has no user_id (i.e. is not a user fork).
   */
  async deleteFork(templateId: string, userId: string): Promise<void> {
    const { documentTemplates } = this.db.schema

    const [existing] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, templateId))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // Only user forks can be deleted via this method
    if (!existing.userId) {
      throw new ForbiddenException('Template is not a user fork — use softDelete for agency templates')
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Cannot delete another user\'s fork')
    }

    await this.db.client
      .update(documentTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentTemplates.id, templateId))

    this.logger.log(`Deleted user fork: ${existing.slug} (${templateId}) by user ${userId}`)
  }

  // -------------------------------------------------------------------------
  // listByChannel — list templates filtered by channel (and optionally user)
  // -------------------------------------------------------------------------

  /**
   * List templates visible to the agency filtered by channel.
   * Includes system templates (agencyId IS NULL) and agency-owned templates.
   * Optionally include user-level templates when userId is provided.
   */
  async listByChannel(agencyId: string, channel?: string, userId?: string) {
    const { documentTemplates } = this.db.schema

    const conditions = [
      eq(documentTemplates.isActive, true),
      or(
        eq(documentTemplates.agencyId, agencyId),
        isNull(documentTemplates.agencyId),
        ...(userId ? [eq(documentTemplates.userId, userId)] : []),
      ),
    ]

    if (channel) {
      conditions.push(eq(documentTemplates.channel, channel))
    }

    return this.db.client
      .select()
      .from(documentTemplates)
      .where(and(...conditions))
      .orderBy(desc(documentTemplates.updatedAt))
  }

  // -------------------------------------------------------------------------
  // renderTemplate — resolve, build context, render via Handlebars
  // -------------------------------------------------------------------------

  async renderTemplate(
    slug: string,
    contextParams: ContextParams,
    additionalVariables?: Record<string, unknown>,
  ): Promise<RenderedDocumentTemplate> {
    const template = await this.resolveTemplate(slug, contextParams.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }

    // Build context from database entities
    const context = await this.contextBuilder.buildContext(
      contextParams,
      additionalVariables,
    )

    // Render each template part via Handlebars
    const subject = template.subjectTemplate
      ? this.handlebars.render(template.subjectTemplate, context)
      : null

    const html = template.emailHtml
      ? this.handlebars.render(template.emailHtml, context)
      : null

    // Render PDF HTML for preview (mirrors PuppeteerPdfService.wrapHtml logic)
    let pdfHtml: string | null = null
    if (template.pdfHtml) {
      const renderedPdf = this.handlebars.render(template.pdfHtml, context)
      const css = template.pdfCss || ''
      const trimmed = renderedPdf.trimStart().toLowerCase()
      if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
        // Full document — inject CSS into existing <head> if provided
        pdfHtml = css
          ? renderedPdf.replace(/(<head[^>]*>)/i, `$1<style>${css}</style>`)
          : renderedPdf
      } else {
        // Fragment — wrap in a full document
        pdfHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${renderedPdf}</body></html>`
      }
    }

    const text = template.textTemplate
      ? this.handlebars.render(template.textTemplate, context)
      : null

    return {
      subject,
      html,
      pdfHtml,
      text,
      templateId: template.id,
      templateSlug: template.slug,
      templateVersion: template.version,
    }
  }

  // -------------------------------------------------------------------------
  // renderTemplatePreview — render with sample data for Library preview
  // -------------------------------------------------------------------------

  async renderTemplatePreview(
    slug: string,
    agencyId: string,
  ): Promise<RenderedDocumentTemplate> {
    // Load real agency + businessConfig, then merge sample data for preview
    const context = await this.contextBuilder.buildContext({ agencyId })

    // Inject logo from businessConfig into agency so {{agency.logo}} works
    const agency = (context.agency ?? {}) as Record<string, unknown>
    const bc = (context.businessConfig ?? {}) as Record<string, unknown>
    if (bc.logo_url && !agency.logo) {
      agency.logo = bc.logo_url
    }

    // Sample data so the template renders with meaningful content
    const sampleData: Record<string, unknown> = {
      agency,
      business: agency,
      businessConfig: bc,
      contact: {
        full_name: 'Jane & John Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane.smith@example.com',
        phone: '(416) 555-0123',
        addressLine1: '123 Main Street',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M5V 2T6',
        country: 'Canada',
      },
      trip: {
        name: 'Mediterranean Cruise Getaway',
        reference: 'PV-2026-0042',
        referenceNumber: 'PV-2026-0042',
        startDate: '2026-06-15',
        endDate: '2026-06-29',
        destination: 'Mediterranean',
        currency: 'CAD',
        totalCost: 12450.00,
        status: 'active',
      },
      agent: {
        full_name: 'Sarah Johnson',
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah@phoenixvoyages.ca',
        phone: '(416) 555-0199',
      },
      payment: {
        amountPaid: 5000.00,
        balanceDue: 7450.00,
      },
      passengers: [
        { full_name: 'Jane Smith', type: 'Adult', dateOfBirth: '1985-03-15', email: 'jane.smith@example.com' },
        { full_name: 'John Smith', type: 'Adult', dateOfBirth: '1983-07-22', email: 'john.smith@example.com' },
        { full_name: 'Emma Smith', type: 'Child', dateOfBirth: '2016-11-08', email: null },
      ],
      bookings: [
        { title: 'MSC Grandiosa - Balcony Cabin B412', booking_type: 'Cruise', vendor_confirmation: 'MSC-78234', start_date: '2026-06-15', end_date: '2026-06-29', amount: 8950.00, currency: 'CAD' },
        { title: 'Airport Transfer - Toronto Pearson', booking_type: 'Transfer', vendor_confirmation: 'TRF-1122', start_date: '2026-06-15', end_date: null, amount: 350.00, currency: 'CAD' },
        { title: 'Comprehensive Travel Insurance', booking_type: 'Insurance', vendor_confirmation: 'INS-44567', start_date: '2026-06-15', end_date: '2026-06-29', amount: 1150.00, currency: 'CAD' },
        { title: 'Barcelona City Tour - Private Guide', booking_type: 'Excursion', vendor_confirmation: 'EXC-8899', start_date: '2026-06-18', end_date: null, amount: 2000.00, currency: 'CAD' },
      ],
    }

    return this.renderTemplateWithContext(slug, agencyId, sampleData)
  }

  // -------------------------------------------------------------------------
  // renderTemplateWithContext — render using a pre-built context
  // -------------------------------------------------------------------------

  private async renderTemplateWithContext(
    slug: string,
    agencyId: string,
    context: Record<string, unknown>,
  ): Promise<RenderedDocumentTemplate> {
    const template = await this.resolveTemplate(slug, agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }

    const subject = template.subjectTemplate
      ? this.handlebars.render(template.subjectTemplate, context)
      : null

    const html = template.emailHtml
      ? this.handlebars.render(template.emailHtml, context)
      : null

    // Render PDF HTML for preview (mirrors PuppeteerPdfService.wrapHtml logic)
    let pdfHtml: string | null = null
    if (template.pdfHtml) {
      const renderedPdf = this.handlebars.render(template.pdfHtml, context)
      const css = template.pdfCss || ''
      const trimmed = renderedPdf.trimStart().toLowerCase()
      if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
        pdfHtml = css
          ? renderedPdf.replace(/(<head[^>]*>)/i, `$1<style>${css}</style>`)
          : renderedPdf
      } else {
        pdfHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${renderedPdf}</body></html>`
      }
    }

    const text = template.textTemplate
      ? this.handlebars.render(template.textTemplate, context)
      : null

    return {
      subject,
      html,
      pdfHtml,
      text,
      templateId: template.id,
      templateSlug: template.slug,
      templateVersion: template.version,
    }
  }
}
