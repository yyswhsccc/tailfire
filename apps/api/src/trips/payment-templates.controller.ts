/**
 * Payment Templates Controller
 *
 * REST endpoints for agency-scoped payment schedule templates.
 * Templates define reusable payment patterns that can be applied to activities.
 *
 * Route structure:
 * - GET    /agencies/:agencyId/payment-templates     - List agency templates
 * - POST   /agencies/:agencyId/payment-templates     - Create template (admin only)
 * - GET    /payment-templates/:id                    - Get template by ID
 * - PATCH  /payment-templates/:id                    - Update template (admin only)
 * - DELETE /payment-templates/:id                    - Delete template (admin only)
 *
 * @see beta/docs/design/payment-schedule/PAYMENT_SCHEDULE_TEMPLATES.md
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger'
import { PaymentTemplatesService } from './payment-templates.service'
import { PaymentAuditService } from './payment-audit.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  PaymentScheduleTemplateDto,
  CreatePaymentScheduleTemplateDto,
  UpdatePaymentScheduleTemplateDto,
  PaymentScheduleAuditLogDto,
  AuditLogQueryDto,
} from '@tailfire/shared-types'

@ApiTags('Payment Templates')
@Controller()
export class PaymentTemplatesController {
  constructor(
    private readonly templatesService: PaymentTemplatesService,
    private readonly auditService: PaymentAuditService
  ) {}

  // ============================================================================
  // Agency-Scoped Template Endpoints
  // ============================================================================

  /**
   * List all payment templates for an agency
   * GET /agencies/:agencyId/payment-templates
   */
  @Get('agencies/:agencyId/payment-templates')
  @ApiOperation({ summary: 'List payment templates for an agency' })
  @ApiParam({ name: 'agencyId', description: 'Agency UUID' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include inactive templates',
  })
  async listTemplates(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
    @Query('includeInactive') includeInactive?: string
  ): Promise<PaymentScheduleTemplateDto[]> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.templatesService.findAllByAgency(auth.agencyId, {
      includeInactive: includeInactive === 'true',
    })
  }

  /**
   * Create a new payment template
   * POST /agencies/:agencyId/payment-templates
   */
  @Post('agencies/:agencyId/payment-templates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a payment template (admin only)' })
  @ApiParam({ name: 'agencyId', description: 'Agency UUID' })
  async createTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
    @Body() dto: CreatePaymentScheduleTemplateDto
  ): Promise<PaymentScheduleTemplateDto> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.templatesService.create(auth.agencyId, auth.userId, dto)
  }

  // ============================================================================
  // Template Instance Endpoints
  // ============================================================================

  /**
   * Get a payment template by ID
   * GET /payment-templates/:id
   */
  @Get('payment-templates/:id')
  @ApiOperation({ summary: 'Get a payment template by ID' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async getTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PaymentScheduleTemplateDto> {
    const template = await this.templatesService.findById(id, auth.agencyId)
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`)
    }

    return template
  }

  /**
   * Update a payment template
   * PATCH /payment-templates/:id
   */
  @Patch('payment-templates/:id')
  @ApiOperation({ summary: 'Update a payment template (admin only)' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async updateTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentScheduleTemplateDto
  ): Promise<PaymentScheduleTemplateDto> {
    return this.templatesService.update(id, auth.agencyId, auth.userId, dto)
  }

  /**
   * Delete (soft) a payment template
   * DELETE /payment-templates/:id
   */
  @Delete('payment-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payment template (admin only)' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async deleteTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.templatesService.delete(id, auth.agencyId, auth.userId)
  }

  // ============================================================================
  // Audit Log Endpoints
  // ============================================================================

  /**
   * Get audit log for an agency
   * GET /agencies/:agencyId/payment-schedule-audit-log
   */
  @Get('agencies/:agencyId/payment-schedule-audit-log')
  @ApiOperation({ summary: 'Get payment schedule audit log for an agency' })
  @ApiParam({ name: 'agencyId', description: 'Agency UUID' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter by entity ID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action' })
  @ApiQuery({ name: 'from', required: false, description: 'Filter entries after date (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'Filter entries before date (ISO)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (default 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  async getAuditLog(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
    @Query() query: AuditLogQueryDto
  ): Promise<PaymentScheduleAuditLogDto[]> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.auditService.getAuditLog(auth.agencyId, query)
  }

  /**
   * Get audit log for a specific template
   * GET /payment-templates/:id/audit-log
   */
  @Get('payment-templates/:id/audit-log')
  @ApiOperation({ summary: 'Get audit log for a specific template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async getTemplateAuditLog(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PaymentScheduleAuditLogDto[]> {
    // Verify template exists and belongs to agency
    await this.templatesService.findByIdOrThrow(id, auth.agencyId)

    return this.auditService.getEntityAuditLog('template', id, auth.agencyId)
  }
}
