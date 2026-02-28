/**
 * Document Render Processor
 *
 * BullMQ worker that renders PDFs from document templates via Puppeteer.
 * The browser instance is lazy-initialized and cached for the lifetime of the process.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Job } from 'bullmq'
import * as puppeteer from 'puppeteer-core'
import { QUEUES } from '../automation/automation.types'
import type { DocumentRenderJobData } from '../automation/automation.types'
import { DocumentTemplatesService } from '../document-templates/document-templates.service'
import { HandlebarsRendererService } from '../document-templates/handlebars-renderer.service'
import { TemplateContextBuilderService } from '../document-templates/template-context-builder.service'

@Processor(QUEUES.DOCUMENT_RENDER)
@Injectable()
export class DocumentRenderProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentRenderProcessor.name)
  private browser: puppeteer.Browser | null = null

  constructor(
    private readonly templatesService: DocumentTemplatesService,
    private readonly handlebars: HandlebarsRendererService,
    private readonly contextBuilder: TemplateContextBuilderService,
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

    // 1. Resolve the template (agency-override aware)
    const template = await this.templatesService.resolveTemplate(
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

    // Wrap with CSS if present
    const fullHtml = template.pdfCss
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${template.pdfCss}</style></head><body>${renderedHtml}</body></html>`
      : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${renderedHtml}</body></html>`

    job.updateProgress(60)

    // 4. Launch/reuse browser and generate PDF
    const browser = await this.getBrowser()
    const page = await browser.newPage()

    try {
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' })

      job.updateProgress(80)

      const pdfBuffer = await page.pdf({
        format: 'letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
      })

      const buffer = Buffer.from(pdfBuffer)

      this.logger.log({
        message: 'PDF render complete',
        jobId: job.id,
        templateSlug,
        size: buffer.length,
      })

      job.updateProgress(100)

      return { buffer, size: buffer.length }
    } finally {
      await page.close()
    }
  }

  // ---------------------------------------------------------------------------
  // Browser management
  // ---------------------------------------------------------------------------

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser
    }

    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'

    this.logger.log(`Launching Puppeteer browser from ${executablePath}`)

    this.browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })

    return this.browser
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing Puppeteer browser')
      await this.browser.close()
      this.browser = null
    }
  }
}
