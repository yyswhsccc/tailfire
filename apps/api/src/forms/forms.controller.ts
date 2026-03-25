/**
 * Forms Controller
 *
 * Public endpoints for token-based forms (insurance waivers, intake forms).
 * NO auth guard — these are accessed by clients via emailed links.
 */

import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Request } from 'express'
import { Public } from '../auth/decorators/public.decorator'
import { FormsService } from './forms.service'

@ApiTags('Forms')
@Controller('forms')
@Public()
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  /**
   * GET /forms/:token
   * Resolve a form token and return the form context for rendering.
   * The client portal uses this to render the appropriate form.
   */
  @Get(':token')
  @ApiOperation({ summary: 'Resolve a form token (public)' })
  @ApiResponse({ status: 200, description: 'Form context for rendering' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  @ApiResponse({ status: 400, description: 'Form expired or already submitted' })
  async resolveForm(@Param('token') token: string) {
    const form = await this.formsService.resolveTokenWithTemplate(token)

    return {
      formType: form.formType,
      tripId: form.tripId,
      travelerIds: form.travelerIds,
      contextData: form.contextData,
      agencyId: form.agencyId,
      template: form.template,
    }
  }

  /**
   * POST /forms/:token/submit
   * Submit a form response. Validates the token, processes the submission,
   * then marks the token as completed.
   */
  @Post(':token/submit')
  @ApiOperation({ summary: 'Submit a form response (public)' })
  @ApiResponse({ status: 200, description: 'Form submitted successfully' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  @ApiResponse({ status: 400, description: 'Form expired, already submitted, or invalid data' })
  async submitForm(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    const form = await this.formsService.resolveToken(token)

    // Capture IP address server-side
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown'

    // Build signature data for audit trail
    const signature = (body as any).signature
    const signatureData = signature ? {
      fullName: signature.fullName || '',
      date: signature.date || new Date().toISOString(),
      ipAddress,
      userAgent: req.headers['user-agent'] || undefined,
      decision: Array.isArray((body as any).decisions) ? (body as any).decisions[0]?.action || '' : '',
      acknowledgedItems: signature.acknowledgedItems,
    } : undefined

    if (form.formType === 'insurance_waiver') {
      const result = await this.formsService.handleInsuranceWaiverSubmission(
        form,
        body,
        ipAddress,
      )
      await this.formsService.markCompleted(token, signatureData, { decisions: (body as any).decisions })
      return result
    }

    await this.formsService.markCompleted(token, signatureData, body)
    return { success: true }
  }
}
