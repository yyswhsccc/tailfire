/**
 * Document Templates Module
 *
 * Block-based document template system with Handlebars rendering.
 * Provides CRUD, forking, and rendering for email/PDF templates.
 */

import { Module } from '@nestjs/common'
import { DocumentTemplatesController } from './document-templates.controller'
import { DocumentTemplatesService } from './document-templates.service'
import { HandlebarsRendererService } from './handlebars-renderer.service'
import { TemplateContextBuilderService } from './template-context-builder.service'

@Module({
  controllers: [DocumentTemplatesController],
  providers: [
    DocumentTemplatesService,
    HandlebarsRendererService,
    TemplateContextBuilderService,
  ],
  exports: [
    DocumentTemplatesService,
    HandlebarsRendererService,
    TemplateContextBuilderService,
  ],
})
export class DocumentTemplatesModule {}
