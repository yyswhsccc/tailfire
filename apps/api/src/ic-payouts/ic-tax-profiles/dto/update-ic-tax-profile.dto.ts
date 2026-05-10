import { z } from 'zod'

export const updateIcTaxProfileSchema = z.object({
  legalName: z.string().min(2).max(255).optional(),
  domicileAddress: z.object({
    street: z.string(),
    city: z.string(),
    province: z.string().length(2),
    postalCode: z.string(),
  }).optional(),
  domicileProvince: z.string().length(2).optional(),
  gstHstRegistered: z.boolean().optional(),
  gstHstNumber: z.string().optional(),
  approvalCeilingCents: z.number().int().nonnegative().optional(),
  autoDisburse: z.boolean().optional(),
})

export type UpdateIcTaxProfileDto = z.infer<typeof updateIcTaxProfileSchema>
