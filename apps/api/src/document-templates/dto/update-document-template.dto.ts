import { z } from 'zod'
import { createDocumentTemplateSchema } from './create-document-template.dto'

export const updateDocumentTemplateSchema = createDocumentTemplateSchema
  .partial()
  .extend({
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })

export type UpdateDocumentTemplateDto = z.infer<typeof updateDocumentTemplateSchema>
