/**
 * Email Templates Controller
 *
 * CRUD endpoints for email templates and templated email sending.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator'
import { Transform } from 'class-transformer'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { EmailService } from './email.service'
import { EmailTemplatesService } from './email-templates.service'
import { VariableResolverService } from './variable-resolver.service'
import {
  SendTemplatedEmailDto,
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  SendTestEmailDto,
} from './dto'
import {
  renderWithSampleData,
  getVariablesWithSampleValues,
} from './sample-data'
import type { AuthContext } from '../auth/auth.types'
import {
  EMAIL_CATEGORY_VALUES,
  type EmailResult,
  type EmailTemplateResponse,
  type EmailCategory,
} from '@tailfire/shared-types'

class ListTemplatesQueryDto {
  @IsOptional()
  @IsIn(EMAIL_CATEGORY_VALUES)
  category?: EmailCategory

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    return value === 'true' || value === true
  })
  isActive?: boolean
}

@ApiTags('Email Templates')
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(
    private readonly emailService: EmailService,
    private readonly templatesService: EmailTemplatesService,
    private readonly variableResolver: VariableResolverService
  ) {}

  /**
   * List all templates (system + agency-specific)
   */
  @Get()
  @ApiOperation({ summary: 'List email templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async listTemplates(
    @GetAuthContext() auth: AuthContext,
    @Query() query: ListTemplatesQueryDto
  ): Promise<EmailTemplateResponse[]> {
    return this.templatesService.listTemplates(auth.agencyId, query)
  }

  /**
   * Get available template variables
   */
  @Get('variables')
  @ApiOperation({ summary: 'Get available template variables' })
  @ApiResponse({ status: 200, description: 'Variables retrieved successfully' })
  getAvailableVariables(): Array<{ key: string; description: string; category: string }> {
    return this.variableResolver.getAvailableVariables()
  }

  /**
   * Get template by slug
   */
  @Get(':slug')
  @ApiOperation({ summary: 'Get template by slug' })
  @ApiResponse({ status: 200, description: 'Template retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplateBySlug(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string
  ): Promise<EmailTemplateResponse> {
    const template = await this.templatesService.getTemplateBySlug(slug, auth.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }
    return template
  }

  /**
   * Create a new template
   */
  @Post()
  @ApiOperation({ summary: 'Create email template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 409, description: 'Template slug already exists' })
  async createTemplate(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateEmailTemplateDto
  ): Promise<EmailTemplateResponse> {
    return this.templatesService.createTemplate(auth.agencyId, dto, auth.userId)
  }

  /**
   * Update an existing template
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update email template' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async updateTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto
  ): Promise<EmailTemplateResponse> {
    return this.templatesService.updateTemplate(id, auth.agencyId, dto, auth.userId)
  }

  /**
   * Delete a template (agency templates only)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete email template' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async deleteTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.templatesService.deleteTemplate(id, auth.agencyId)
  }

  /**
   * Preview a template with sample data
   * Renders the template using realistic sample values for all variables
   */
  @Get(':slug/preview')
  @ApiOperation({ summary: 'Preview template with sample data' })
  @ApiResponse({ status: 200, description: 'Template preview rendered successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async previewTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string
  ): Promise<{
    subject: string
    bodyHtml: string
    bodyText: string | null
    variables: Array<{ key: string; value: string; description: string }>
  }> {
    const template = await this.templatesService.getTemplateBySlug(slug, auth.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }

    // Render with sample data
    const subject = renderWithSampleData(template.subject)
    const bodyHtml = renderWithSampleData(template.bodyHtml)
    const bodyText = template.bodyText ? renderWithSampleData(template.bodyText) : null

    // Extract variables used in template with their sample values
    const variables = getVariablesWithSampleValues(
      template.subject,
      template.bodyHtml,
      template.bodyText ?? undefined
    )

    return {
      subject,
      bodyHtml,
      bodyText,
      variables,
    }
  }

  /**
   * Send a test email using a template with sample data
   * Sends to the current user or specified recipient
   */
  @Post(':slug/test')
  @ApiOperation({ summary: 'Send test email with sample data' })
  @ApiResponse({ status: 201, description: 'Test email sent successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async sendTestEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() dto: SendTestEmailDto
  ): Promise<EmailResult> {
    const template = await this.templatesService.getTemplateBySlug(slug, auth.agencyId)
    if (!template) {
      throw new NotFoundException(`Template "${slug}" not found`)
    }

    // Determine recipient - use provided email or fall back to current user's email
    const recipientEmail = dto.recipientEmail || auth.email
    if (!recipientEmail) {
      throw new NotFoundException('No recipient email available')
    }

    // Render with sample data
    const subject = `[TEST] ${renderWithSampleData(template.subject)}`
    const bodyHtml = renderWithSampleData(template.bodyHtml)
    const bodyText = template.bodyText ? renderWithSampleData(template.bodyText) : undefined

    // Send the test email
    return this.emailService.sendTemplatedEmailWithRenderedContent({
      to: [recipientEmail],
      subject,
      html: bodyHtml,
      text: bodyText,
      agencyId: auth.agencyId,
      templateSlug: slug,
      createdBy: auth.userId,
    })
  }

  /**
   * Render a template with real context data (trip, contact, agent)
   * Returns rendered HTML + list of unresolved variables for the composer
   */
  @Post(':slug/render')
  @ApiOperation({ summary: 'Render template with context' })
  @ApiResponse({ status: 200, description: 'Template rendered successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async renderWithContext(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: { tripId?: string; contactId?: string; variables?: Record<string, string> },
  ) {
    return this.templatesService.renderWithContext(slug, auth.agencyId, {
      tripId: body.tripId,
      contactId: body.contactId,
      agentId: auth.userId,
      variables: body.variables,
    })
  }

  /**
   * Send an email using a template
   */
  @Post('send')
  @ApiOperation({ summary: 'Send templated email' })
  @ApiResponse({ status: 201, description: 'Email sent successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async sendTemplatedEmail(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: SendTemplatedEmailDto
  ): Promise<EmailResult> {
    // Build resolver context
    const context = {
      agencyId: auth.agencyId,
      tripId: dto.context.tripId,
      contactId: dto.context.contactId,
      activityId: dto.context.activityId,
      agentId: dto.context.agentId,
    }

    // Render the template
    const rendered = await this.templatesService.renderTemplate(
      dto.templateSlug,
      context,
      dto.variables
    )

    // Send the email
    return this.emailService.sendTemplatedEmailWithRenderedContent({
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      replyTo: dto.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      agencyId: auth.agencyId,
      tripId: dto.context.tripId,
      contactId: dto.context.contactId,
      activityId: dto.context.activityId,
      templateSlug: dto.templateSlug,
      variables: {
        ...dto.variables,
        ...dto.context.customVariables,
      },
      createdBy: auth.userId,
    })
  }
}
