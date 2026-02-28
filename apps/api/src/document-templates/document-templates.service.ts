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
}

export interface RenderedDocumentTemplate {
  subject: string | null
  html: string | null
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
   * Returns the matching row or null.
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
  // update — update agency template (rejects system templates)
  // -------------------------------------------------------------------------

  async update(
    id: string,
    agencyId: string,
    dto: UpdateDocumentTemplateDto,
    updatedBy?: string,
  ) {
    const { documentTemplates } = this.db.schema

    // Verify template exists and belongs to agency (not a system template)
    const [existing] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    if (!existing.agencyId) {
      throw new ForbiddenException('Cannot modify system templates directly. Fork the template first.')
    }

    if (existing.agencyId !== agencyId) {
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

    // Check if agency already has a fork of that slug
    const [existingFork] = await this.db.client
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, source.slug),
          eq(documentTemplates.agencyId, agencyId),
          eq(documentTemplates.isActive, true),
        ),
      )
      .limit(1)

    if (existingFork) {
      throw new ConflictException(
        `Agency already has a template with slug "${source.slug}". Edit the existing template instead.`,
      )
    }

    // Deep-copy the template
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

    const text = template.textTemplate
      ? this.handlebars.render(template.textTemplate, context)
      : null

    return {
      subject,
      html,
      text,
      templateId: template.id,
      templateSlug: template.slug,
      templateVersion: template.version,
    }
  }
}
