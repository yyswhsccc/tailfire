import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'

type AgencyTaxFilingConfig = typeof schema.agencyTaxFilingConfig.$inferSelect
type NewAgencyTaxFilingConfig = typeof schema.agencyTaxFilingConfig.$inferInsert

export interface UpsertTaxFilingInput {
  legalName: string
  payerAccountNumber: string
  transmitterNumber?: string
  filingAddress: { street: string; city: string; province: string; postalCode: string }
  filingProvince: string
  filingContactName?: string
  filingContactEmail?: string
  filingContactPhone?: string
  effectiveFrom: string // YYYY-MM-DD
}

@Injectable()
export class AgencyTaxFilingService {
  constructor(private readonly db: DatabaseService) {}

  async get(agencyId: string): Promise<AgencyTaxFilingConfig | null> {
    const [row] = await this.db.client
      .select()
      .from(schema.agencyTaxFilingConfig)
      .where(eq(schema.agencyTaxFilingConfig.agencyId, agencyId))
      .limit(1)
    return row ?? null
  }

  async upsert(
    agencyId: string,
    userId: string,
    input: UpsertTaxFilingInput,
  ): Promise<AgencyTaxFilingConfig> {
    const existing = await this.get(agencyId)

    if (existing) {
      const [updated] = await this.db.client
        .update(schema.agencyTaxFilingConfig)
        .set({
          legalName: input.legalName,
          payerAccountNumber: input.payerAccountNumber,
          transmitterNumber: input.transmitterNumber ?? null,
          filingAddress: input.filingAddress as NewAgencyTaxFilingConfig['filingAddress'],
          filingProvince: input.filingProvince,
          filingContactName: input.filingContactName ?? null,
          filingContactEmail: input.filingContactEmail ?? null,
          filingContactPhone: input.filingContactPhone ?? null,
          effectiveFrom: input.effectiveFrom,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.agencyTaxFilingConfig.agencyId, agencyId))
        .returning()
      return updated!
    } else {
      const [created] = await this.db.client
        .insert(schema.agencyTaxFilingConfig)
        .values({
          agencyId,
          legalName: input.legalName,
          payerAccountNumber: input.payerAccountNumber,
          transmitterNumber: input.transmitterNumber,
          filingAddress: input.filingAddress as NewAgencyTaxFilingConfig['filingAddress'],
          filingProvince: input.filingProvince,
          filingContactName: input.filingContactName,
          filingContactEmail: input.filingContactEmail,
          filingContactPhone: input.filingContactPhone,
          effectiveFrom: input.effectiveFrom,
          createdBy: userId,
          updatedBy: userId,
        } satisfies NewAgencyTaxFilingConfig)
        .returning()
      return created!
    }
  }
}
