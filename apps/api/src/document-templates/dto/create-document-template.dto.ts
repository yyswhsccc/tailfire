import { z } from 'zod'

export const TEMPLATE_CATEGORIES = ['trip_order', 'payment', 'email', 'proposal', 'form', 'notification', 'system', 'client_care'] as const
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
  emailHtml: z.string().nullable().optional(),
  emailCss: z.string().nullable().optional(),
  pdfHtml: z.string().nullable().optional(),
  pdfCss: z.string().nullable().optional(),
  subjectTemplate: z.string().nullable().optional(),
  textTemplate: z.string().nullable().optional(),
  variables: z.record(z.unknown()).nullable().optional(),
  outputTypes: z.array(z.enum(['email', 'pdf', 'form', 'sms'])).default(['email']),
  formJson: z.record(z.unknown()).nullable().optional(),
})

export type CreateDocumentTemplateDto = z.infer<typeof createDocumentTemplateSchema>
