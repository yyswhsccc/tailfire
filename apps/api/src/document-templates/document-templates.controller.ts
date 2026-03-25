/**
 * Document Templates Controller
 *
 * REST endpoints for document template CRUD, forking, and preview rendering.
 *
 * Route structure (static routes BEFORE dynamic):
 * - GET    /document-templates/variables       - Available template variables & helpers
 * - GET    /document-templates/categories      - Template category list
 * - GET    /document-templates                 - List templates (filtered by category, status, channel)
 * - GET    /document-templates/:idOrSlug       - Get by UUID or slug
 * - GET    /document-templates/:slug/preview   - Preview with sample context
 * - POST   /document-templates                 - Create template
 * - PATCH  /document-templates/:id             - Update template
 * - DELETE /document-templates/:id             - Soft delete
 * - POST   /document-templates/:id/fork        - Fork system template for agency
 * - POST   /document-templates/:id/fork-user   - Fork template for current user
 * - DELETE /document-templates/:id/fork        - Delete user fork (revert to parent)
 * - POST   /document-templates/:id/publish     - Publish template
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { zodValidation } from '../common/pipes'
import { DocumentTemplatesService } from './document-templates.service'
import {
  createDocumentTemplateSchema,
  TEMPLATE_CATEGORIES,
  type CreateDocumentTemplateDto,
} from './dto/create-document-template.dto'
import {
  updateDocumentTemplateSchema,
  type UpdateDocumentTemplateDto,
} from './dto/update-document-template.dto'

// ---------------------------------------------------------------------------
// UUID format check (used for idOrSlug disambiguation)
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Available variables & helpers (static response)
// ---------------------------------------------------------------------------

const AVAILABLE_VARIABLES = {
  variables: {
    agency: [
      'agency.name',
      'agency.email',
      'agency.phone',
      'agency.address',
      'agency.website',
      'agency.logo',
    ],
    contact: [
      'contact.first_name',
      'contact.last_name',
      'contact.full_name',
      'contact.email',
      'contact.phone',
    ],
    trip: [
      'trip.name',
      'trip.startDate',
      'trip.endDate',
      'trip.status',
      'trip.totalCost',
      'trip.currency',
    ],
    agent: [
      'agent.first_name',
      'agent.last_name',
      'agent.full_name',
      'agent.name',
      'agent.email',
    ],
    activity: [
      'activity.name',
      'activity.type',
      'activity.startDate',
      'activity.endDate',
    ],
    payment: [
      'payment.amount',
      'payment.currency',
      'payment.dueDate',
      'payment.status',
    ],
  },
  helpers: [
    { name: 'fallback', usage: '{{fallback value "default"}}', description: 'Returns value or default if empty' },
    { name: 'formatCurrency', usage: '{{formatCurrency amount currency}}', description: 'Format number as currency' },
    { name: 'formatDate', usage: '{{formatDate date "format"}}', description: 'Format date string' },
    { name: 'uppercase', usage: '{{uppercase text}}', description: 'Convert text to uppercase' },
  ],
  blockHelpers: [
    { name: '#if', usage: '{{#if condition}}...{{/if}}', description: 'Conditional block' },
    { name: '#each', usage: '{{#each items}}...{{/each}}', description: 'Iterate over array' },
  ],
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('Document Templates')
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(
    private readonly templatesService: DocumentTemplatesService,
  ) {}

  // -----------------------------------------------------------------------
  // GET /variables — static variables & helpers reference
  // -----------------------------------------------------------------------

  @Get('variables')
  @ApiOperation({ summary: 'Get available template variables and helpers' })
  @ApiResponse({ status: 200, description: 'Variables and helpers reference' })
  getVariables() {
    return AVAILABLE_VARIABLES
  }

  // -----------------------------------------------------------------------
  // GET /categories — template category list
  // -----------------------------------------------------------------------

  @Get('categories')
  @ApiOperation({ summary: 'Get template categories' })
  @ApiResponse({ status: 200, description: 'Category list' })
  getCategories() {
    return TEMPLATE_CATEGORIES
  }

  // -----------------------------------------------------------------------
  // GET / — list templates (with optional filters)
  // -----------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List document templates' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'channel', required: false, description: 'Filter by channel (email, pdf, form, sms)' })
  @ApiResponse({ status: 200, description: 'Templates list' })
  async list(
    @GetAuthContext() auth: AuthContext,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
  ) {
    return this.templatesService.list(auth.agencyId, { category, status, channel })
  }

  // -----------------------------------------------------------------------
  // GET /:slug/preview — preview with empty/sample context
  // (MUST be declared before :idOrSlug to avoid route shadowing)
  // -----------------------------------------------------------------------

  @Get(':slug/preview')
  @ApiOperation({ summary: 'Preview template with sample context' })
  @ApiParam({ name: 'slug', description: 'Template slug' })
  @ApiResponse({ status: 200, description: 'Rendered preview' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async preview(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string,
  ) {
    return this.templatesService.renderTemplatePreview(slug, auth.agencyId)
  }

  // -----------------------------------------------------------------------
  // GET /:idOrSlug — get by UUID or slug
  // -----------------------------------------------------------------------

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get template by ID or slug' })
  @ApiParam({ name: 'idOrSlug', description: 'Template UUID or slug' })
  @ApiResponse({ status: 200, description: 'Template found' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getByIdOrSlug(
    @GetAuthContext() auth: AuthContext,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    // Try UUID first, then fall back to slug
    if (UUID_REGEX.test(idOrSlug)) {
      const template = await this.templatesService.getById(idOrSlug, auth.agencyId)
      if (template) return template
    }

    // Slug lookup via resolve (returns agency override or system template)
    const template = await this.templatesService.resolveTemplate(idOrSlug, auth.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${idOrSlug}" not found`)
    }
    return template
  }

  // -----------------------------------------------------------------------
  // POST / — create template
  // -----------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(zodValidation(createDocumentTemplateSchema))
  @ApiOperation({ summary: 'Create document template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateDocumentTemplateDto,
  ) {
    return this.templatesService.create(auth.agencyId, dto, auth.userId)
  }

  // -----------------------------------------------------------------------
  // PATCH /:id — update template
  // -----------------------------------------------------------------------

  @Patch(':id')
  @UsePipes(zodValidation(updateDocumentTemplateSchema))
  @ApiOperation({ summary: 'Update document template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({ status: 200, description: 'Template updated' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return this.templatesService.update(id, auth.agencyId, dto, auth.userId)
  }

  // -----------------------------------------------------------------------
  // DELETE /:id — soft delete
  // -----------------------------------------------------------------------

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete document template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({ status: 204, description: 'Template deleted' })
  @ApiResponse({ status: 403, description: 'Cannot delete system templates' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templatesService.softDelete(id, auth.agencyId)
  }

  // -----------------------------------------------------------------------
  // POST /:id/fork — fork system template
  // -----------------------------------------------------------------------

  @Post(':id/fork')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Fork a system template for the agency' })
  @ApiParam({ name: 'id', description: 'System template UUID to fork' })
  @ApiResponse({ status: 201, description: 'Template forked' })
  @ApiResponse({ status: 404, description: 'Source template not found' })
  @ApiResponse({ status: 409, description: 'Fork already exists' })
  async fork(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templatesService.fork(id, auth.agencyId, auth.userId)
  }

  // -----------------------------------------------------------------------
  // POST /:id/fork-user — fork template for the current user
  // -----------------------------------------------------------------------

  @Post(':id/fork-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Fork a template for the current user' })
  @ApiParam({ name: 'id', description: 'Template UUID to fork' })
  @ApiResponse({ status: 201, description: 'Template forked for user' })
  @ApiResponse({ status: 404, description: 'Source template not found' })
  @ApiResponse({ status: 409, description: 'User fork already exists for this slug' })
  async forkTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templatesService.forkTemplate(id, auth.userId, auth.agencyId)
  }

  // -----------------------------------------------------------------------
  // DELETE /:id/fork — delete user fork, reverting to parent template
  // -----------------------------------------------------------------------

  @Delete(':id/fork')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user fork, reverting to parent template' })
  @ApiParam({ name: 'id', description: 'User fork template UUID' })
  @ApiResponse({ status: 204, description: 'Fork deleted' })
  @ApiResponse({ status: 403, description: 'Not a user fork or not owned by user' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async deleteFork(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templatesService.deleteFork(id, auth.userId)
  }

  // -----------------------------------------------------------------------
  // POST /:id/publish — publish template (calls update with status)
  // -----------------------------------------------------------------------

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a document template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({ status: 200, description: 'Template published' })
  @ApiResponse({ status: 403, description: 'Cannot modify system templates' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async publish(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templatesService.update(id, auth.agencyId, { status: 'published' }, auth.userId)
  }
}
