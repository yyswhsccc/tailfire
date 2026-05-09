import { z } from 'zod'

export const createPayoutAccountSchema = z.object({
  label: z.string().min(1).max(80),
  currency: z.string().length(3),
  rail: z.enum(['interac_etransfer', 'eft', 'wise', 'wire', 'visa_direct']),
  details: z.record(z.unknown()),
  isDefaultForCurrency: z.boolean().optional(),
  padAgreementVersion: z.string().optional(),
  padAcceptedIp: z.string().ip().optional(),
})

export type CreatePayoutAccountDto = z.infer<typeof createPayoutAccountSchema>
