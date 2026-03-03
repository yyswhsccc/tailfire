/**
 * Document Render Controller
 *
 * REST endpoints for queuing and monitoring PDF render jobs.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { DocumentRenderService } from './document-render.service'
import type { DocumentRenderJobData } from '../automation/automation.types'

@ApiTags('Documents')
@Controller('documents')
export class DocumentRenderController {
  constructor(private readonly renderService: DocumentRenderService) {}

  // -------------------------------------------------------------------------
  // POST /render-pdf — queue a PDF render job
  // -------------------------------------------------------------------------

  @Post('render-pdf')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a PDF render job' })
  @ApiResponse({ status: 202, description: 'Job queued successfully' })
  async renderPdf(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { templateSlug: string; tripId?: string; contactId?: string; additionalVariables?: Record<string, unknown> },
  ) {
    const data: DocumentRenderJobData = {
      templateSlug: body.templateSlug,
      contextParams: {
        agencyId: auth.agencyId,
        tripId: body.tripId,
        contactId: body.contactId,
      },
      additionalVariables: body.additionalVariables,
      outputFormat: 'pdf',
      requestedBy: auth.userId,
    }

    const jobId = await this.renderService.queuePdfRender(data)

    return {
      jobId,
      status: 'queued',
    }
  }

  // -------------------------------------------------------------------------
  // GET /render-pdf/:jobId — check job status
  // -------------------------------------------------------------------------

  @Get('render-pdf/:jobId')
  @ApiOperation({ summary: 'Check PDF render job status' })
  @ApiParam({ name: 'jobId', description: 'Job ID returned from POST /render-pdf' })
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.renderService.getJobStatus(jobId)
    if (!status) {
      throw new NotFoundException(`Render job "${jobId}" not found`)
    }
    return status
  }
}
