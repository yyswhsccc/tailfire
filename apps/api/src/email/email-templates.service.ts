/**
 * Email Templates Service
 *
 * CRUD operations for email templates and rendering with variable substitution.
 */

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common'
import { eq, and, ilike, desc, or } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { VariableResolverService, ResolverContext } from './variable-resolver.service'
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto'
import type {
  EmailTemplateResponse,
  EmailCategory,
  RenderedTemplate,
} from '@tailfire/shared-types'

interface ListTemplatesFilters {
  category?: EmailCategory
  search?: string
  isActive?: boolean
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly variableResolver: VariableResolverService
  ) {}

  /**
   * Get template by slug
   */
  async getTemplateBySlug(
    slug: string,
    agencyId?: string
  ): Promise<EmailTemplateResponse | null> {
    const { emailTemplates } = this.db.schema

    // First try agency-specific template, then system template
    const conditions = agencyId
      ? or(
          and(eq(emailTemplates.slug, slug), eq(emailTemplates.agencyId, agencyId)),
          and(eq(emailTemplates.slug, slug), eq(emailTemplates.isSystem, true))
        )
      : and(eq(emailTemplates.slug, slug), eq(emailTemplates.isSystem, true))

    const templates = await this.db.client
      .select()
      .from(emailTemplates)
      .where(conditions)
      .orderBy(desc(emailTemplates.agencyId)) // Agency-specific first (not null > null)
      .limit(1)

    const template = templates[0]
    return template ? this.mapToResponse(template) : null
  }

  /**
   * Get template by ID
   */
  async getTemplateById(
    id: string,
    agencyId?: string
  ): Promise<EmailTemplateResponse | null> {
    const { emailTemplates } = this.db.schema

    const conditions = agencyId
      ? and(
          eq(emailTemplates.id, id),
          or(eq(emailTemplates.agencyId, agencyId), eq(emailTemplates.isSystem, true))
        )
      : eq(emailTemplates.id, id)

    const [template] = await this.db.client
      .select()
      .from(emailTemplates)
      .where(conditions)
      .limit(1)

    return template ? this.mapToResponse(template) : null
  }

  /**
   * List templates with optional filtering
   */
  async listTemplates(
    agencyId?: string,
    filters: ListTemplatesFilters = {}
  ): Promise<EmailTemplateResponse[]> {
    const { emailTemplates } = this.db.schema

    // Build conditions
    const conditions = []

    // Show system templates + agency-specific templates
    if (agencyId) {
      conditions.push(
        or(eq(emailTemplates.agencyId, agencyId), eq(emailTemplates.isSystem, true))
      )
    } else {
      conditions.push(eq(emailTemplates.isSystem, true))
    }

    if (filters.category) {
      conditions.push(eq(emailTemplates.category, filters.category))
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(emailTemplates.isActive, filters.isActive))
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(emailTemplates.name, `%${filters.search}%`),
          ilike(emailTemplates.slug, `%${filters.search}%`),
          ilike(emailTemplates.description, `%${filters.search}%`)
        )
      )
    }

    const templates = await this.db.client
      .select()
      .from(emailTemplates)
      .where(and(...conditions))
      .orderBy(desc(emailTemplates.isSystem), emailTemplates.name)

    return templates.map(this.mapToResponse)
  }

  /**
   * Create a new template
   */
  async createTemplate(
    agencyId: string,
    dto: CreateEmailTemplateDto,
    createdBy?: string
  ): Promise<EmailTemplateResponse> {
    const { emailTemplates } = this.db.schema

    // Check if slug already exists for this agency
    const existing = await this.getTemplateBySlug(dto.slug, agencyId)
    if (existing && existing.agencyId === agencyId) {
      throw new ConflictException(`Template with slug "${dto.slug}" already exists`)
    }

    const insertResult = await this.db.client
      .insert(emailTemplates)
      .values({
        agencyId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        variables: dto.variables,
        category: dto.category || 'notification',
        isSystem: false,
        isActive: dto.isActive ?? true,
        createdBy,
      })
      .returning()

    const template = insertResult[0]!
    this.logger.log(`Created email template: ${template.slug} (${template.id})`)
    return this.mapToResponse(template)
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: string,
    agencyId: string,
    dto: UpdateEmailTemplateDto,
    _updatedBy?: string
  ): Promise<EmailTemplateResponse> {
    const { emailTemplates } = this.db.schema

    // Verify template exists and belongs to agency (can't edit system templates)
    const [existing] = await this.db.client
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.agencyId, agencyId)))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Template ${id} not found or not editable`)
    }

    const updateResult = await this.db.client
      .update(emailTemplates)
      .set({
        name: dto.name ?? existing.name,
        description: dto.description ?? existing.description,
        subject: dto.subject ?? existing.subject,
        bodyHtml: dto.bodyHtml ?? existing.bodyHtml,
        bodyText: dto.bodyText ?? existing.bodyText,
        variables: dto.variables ?? existing.variables,
        category: dto.category ?? existing.category,
        isActive: dto.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplates.id, id))
      .returning()

    const template = updateResult[0]!
    this.logger.log(`Updated email template: ${template.slug} (${template.id})`)
    return this.mapToResponse(template)
  }

  /**
   * Delete a template (agency templates only)
   */
  async deleteTemplate(id: string, agencyId: string): Promise<void> {
    const { emailTemplates } = this.db.schema

    // Can only delete agency-specific templates
    const result = await this.db.client
      .delete(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, id),
          eq(emailTemplates.agencyId, agencyId),
          eq(emailTemplates.isSystem, false)
        )
      )
      .returning({ id: emailTemplates.id })

    if (result.length === 0) {
      throw new NotFoundException(`Template ${id} not found or not deletable`)
    }

    this.logger.log(`Deleted email template: ${id}`)
  }

  /**
   * Render template with variable substitution
   */
  async renderTemplate(
    slug: string,
    context: ResolverContext,
    additionalVariables?: Record<string, string>
  ): Promise<RenderedTemplate> {
    const template = await this.getTemplateBySlug(slug, context.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }

    // Render subject and body with variable substitution
    const [subject, bodyHtml, bodyText] = await Promise.all([
      this.variableResolver.resolveText(template.subject, context, additionalVariables),
      this.variableResolver.resolveText(template.bodyHtml, context, additionalVariables),
      template.bodyText
        ? this.variableResolver.resolveText(template.bodyText, context, additionalVariables)
        : Promise.resolve(undefined),
    ])

    return {
      subject,
      html: bodyHtml,
      text: bodyText,
      templateId: template.id,
      templateSlug: template.slug,
    }
  }

  /**
   * Render a template with real context, apply manual variable overrides,
   * and report any remaining unresolved variables.
   * Used by the email composer's template picker.
   */
  async renderWithContext(
    slug: string,
    agencyId: string,
    context: { tripId?: string; contactId?: string; agentId?: string; variables?: Record<string, string> },
  ): Promise<{ subject: string; bodyHtml: string; unresolvedVariables: string[] }> {
    const rendered = await this.renderTemplate(slug, {
      agencyId,
      tripId: context.tripId,
      contactId: context.contactId,
      agentId: context.agentId,
    })

    let subject = rendered.subject || ''
    let bodyHtml = rendered.html || ''

    // Apply manual variable overrides
    if (context.variables) {
      for (const [key, value] of Object.entries(context.variables)) {
        const pattern = new RegExp(`\\{\\{${key}(?:::.*?)?\\}\\}`, 'g')
        subject = subject.replace(pattern, value)
        bodyHtml = bodyHtml.replace(pattern, value)
      }
    }

    // Find remaining unresolved variables
    const unresolvedSet = new Set<string>()
    const varPattern = /\{\{(\w+(?:\.\w+)*)(?:::.*?)?\}\}/g
    let match: RegExpExecArray | null
    while ((match = varPattern.exec(subject + bodyHtml)) !== null) {
      unresolvedSet.add(match[1])
    }

    return { subject, bodyHtml, unresolvedVariables: [...unresolvedSet] }
  }

  /**
   * Map database row to response DTO
   */
  private mapToResponse(template: any): EmailTemplateResponse {
    return {
      id: template.id,
      agencyId: template.agencyId,
      slug: template.slug,
      name: template.name,
      description: template.description,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      variables: template.variables,
      category: template.category as EmailCategory,
      isSystem: template.isSystem,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt?.toISOString() || null,
      createdBy: template.createdBy,
    }
  }
}
