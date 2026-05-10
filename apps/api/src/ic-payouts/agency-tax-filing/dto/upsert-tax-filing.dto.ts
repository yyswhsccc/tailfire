import { z } from 'zod'

export const upsertTaxFilingSchema = z.object({
  legalName: z.string().min(2).max(255),
  // BN15: 9 digits + 2 uppercase letters + 4 digits, e.g. 123456789RP0001
  payerAccountNumber: z
    .string()
    .regex(/^\d{9}[A-Z]{2}\d{4}$/, 'Must be CRA BN15 format (e.g. 123456789RP0001)'),
  transmitterNumber: z
    .string()
    .regex(/^MM\d{6}$/, 'Must be MM###### format')
    .optional()
    .or(z.literal('')),
  filingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    province: z.string().length(2),
    postalCode: z.string().regex(/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i, 'Must be valid Canadian postal code'),
  }),
  filingProvince: z.string().length(2),
  filingContactName: z.string().optional(),
  filingContactEmail: z.string().email().optional().or(z.literal('')),
  filingContactPhone: z.string().optional(),
  effectiveFrom: z.string().date(),
})

export type UpsertTaxFilingDto = z.infer<typeof upsertTaxFilingSchema>
