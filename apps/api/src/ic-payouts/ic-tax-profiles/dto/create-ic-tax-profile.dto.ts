import { z } from 'zod'

export const createIcTaxProfileSchema = z.object({
  legalName: z.string().min(2).max(255),
  domicileAddress: z.object({
    street: z.string(),
    city: z.string(),
    province: z.string().length(2),
    postalCode: z.string(),
  }),
  domicileProvince: z.string().length(2),
  isCorporation: z.boolean(),
  sinOrBn: z.string().regex(/^[\d\-A-Za-z]{9,16}$/, 'Must be a SIN or BN'),
  gstHstRegistered: z.boolean(),
  gstHstNumber: z.string().optional(),
  gstHstEffectiveFrom: z.string().date().optional(),
})

export type CreateIcTaxProfileDto = z.infer<typeof createIcTaxProfileSchema>
