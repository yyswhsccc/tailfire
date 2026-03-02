/**
 * Document Render Processor
 *
 * BullMQ worker that renders PDFs from document templates.
 * Delegates PDF generation to PuppeteerPdfService (shared browser instance).
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { QUEUES } from '../automation/automation.types'
import type { DocumentRenderJobData } from '../automation/automation.types'
import { DocumentTemplatesService } from '../document-templates/document-templates.service'
import { HandlebarsRendererService } from '../document-templates/handlebars-renderer.service'
import { TemplateContextBuilderService } from '../document-templates/template-context-builder.service'
import { PuppeteerPdfService } from './puppeteer-pdf.service'

@Processor(QUEUES.DOCUMENT_RENDER)
@Injectable()
export class DocumentRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentRenderProcessor.name)

  constructor(
    private readonly templatesService: DocumentTemplatesService,
    private readonly handlebars: HandlebarsRendererService,
    private readonly contextBuilder: TemplateContextBuilderService,
    private readonly puppeteerPdf: PuppeteerPdfService,
  ) {
    super()
  }

  // ---------------------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------------------

  async process(
    job: Job<DocumentRenderJobData>,
  ): Promise<{ buffer: Buffer; size: number }> {
    const { templateSlug, contextParams, additionalVariables } = job.data

    this.logger.log({
      message: 'Starting PDF render',
      jobId: job.id,
      templateSlug,
      contextParams,
    })

    // 1. Resolve the template (agency-override aware, published only)
    const template = await this.templatesService.resolvePublishedTemplate(
      templateSlug,
      contextParams.agencyId,
    )
    if (!template) {
      throw new Error(`Template "${templateSlug}" not found for agency ${contextParams.agencyId}`)
    }

    if (!template.pdfHtml) {
      throw new Error(`Template "${templateSlug}" has no pdf_html content`)
    }

    job.updateProgress(20)

    // 2. Build context from database entities
    const context = await this.contextBuilder.buildContext(
      contextParams,
      additionalVariables,
    )

    job.updateProgress(40)

    // 3. Render the Handlebars template
    const renderedHtml = this.handlebars.render(template.pdfHtml, context)

    job.updateProgress(60)

    // 4. Generate PDF via shared PuppeteerPdfService
    const buffer = await this.puppeteerPdf.renderHtmlToPdf(renderedHtml, template.pdfCss ?? undefined)

    this.logger.log({
      message: 'PDF render complete',
      jobId: job.id,
      templateSlug,
      size: buffer.length,
    })

    job.updateProgress(100)

    return { buffer, size: buffer.length }
  }
}
