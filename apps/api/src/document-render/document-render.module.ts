/**
 * Document Render Module
 *
 * PDF rendering via BullMQ + Puppeteer.
 * Processes document templates into PDFs using a background worker.
 */

import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUES } from '../automation/automation.types'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
import { DocumentRenderController } from './document-render.controller'
import { DocumentRenderService } from './document-render.service'
import { DocumentRenderProcessor } from './document-render.processor'
import { PuppeteerPdfService } from './puppeteer-pdf.service'

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_RENDER,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 100 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    }),
    DocumentTemplatesModule,
  ],
  controllers: [DocumentRenderController],
  providers: [DocumentRenderService, DocumentRenderProcessor, PuppeteerPdfService],
  exports: [DocumentRenderService, PuppeteerPdfService],
})
export class DocumentRenderModule {}
