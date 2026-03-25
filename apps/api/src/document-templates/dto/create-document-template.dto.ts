import { z } from 'zod'

export const TEMPLATE_CATEGORIES = ['trip_order', 'payment', 'email', 'proposal'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
export const BLOCK_PERMISSIONS = ['editable', 'branding', 'locked'] as const

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  permission: z.string().default('editable'),
  content: z.record(z.unknown()),
})

export const createDocumentTemplateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(TEMPLATE_CATEGORIES),
  blocksJson: z
    .object({ blocks: z.array(blockSchema) })
    .default({ blocks: [] }),
  emailHtml: z.string().optional(),
  emailCss: z.string().optional(),
  pdfHtml: z.string().optional(),
  pdfCss: z.string().optional(),
  subjectTemplate: z.string().optional(),
  textTemplate: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  outputTypes: z.array(z.enum(['email', 'pdf'])).default(['email']),
  formJson: z.record(z.unknown()).optional(),
})

export type CreateDocumentTemplateDto = z.infer<typeof createDocumentTemplateSchema>
