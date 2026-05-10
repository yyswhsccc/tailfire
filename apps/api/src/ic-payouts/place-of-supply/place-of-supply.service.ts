/**
 * PlaceOfSupplyService
 *
 * Resolves the GST/HST tax jurisdiction and rate for an IC commission invoice
 * using CRA's general place-of-supply rule for services.
 *
 * CRA General Rule (GST/HST Memorandum 3.3):
 *   For a supply of a service (other than specific exceptions), the place of
 *   supply is the province where the recipient (the agency) is located — i.e.,
 *   the agency's GST/HST filing province.
 *
 * TODO(tax-counsel): CRA Memorandum 3-3-6 lists exceptions where the general
 *   rule does NOT apply:
 *   - Services in relation to real property (place = where real property is)
 *   - Services performed in person (place = where performed)
 *   - Advisory or consulting services (generally follow recipient address — OK)
 *   - Transportation services (place = where transportation originates)
 *   For the current fact pattern (IC earning commission on travel bookings from
 *   a travel agency), the general recipient-address rule almost certainly
 *   applies. Tax counsel should confirm before launch and flag any edge cases
 *   that would trigger a Memorandum 3-3-6 exception.
 */

import { Injectable } from '@nestjs/common'
import { sql, eq, and, lte, or, isNull, gte } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'

export interface ResolveInput {
  /** Agency's Tailfire ID */
  agencyId: string
  /** IC's home province (domicile). Under the general CRA rule this is
   *  intentionally ignored — the agency's filing province governs. */
  icDomicileProvince: string
  /** Invoice date in YYYY-MM-DD format. Used to look up the effective tax rate. */
  invoiceDate: string
  /** Whether the IC holds a valid GST/HST registration number. If false,
   *  they cannot charge GST/HST regardless of jurisdiction. */
  icGstHstRegistered: boolean
}

export interface ResolveOutput {
  /** The CRA tax jurisdiction province/territory code (2-letter). */
  jurisdiction: string
  /** Tax type: 'HST' | 'GST' | 'GST+QST' | 'GST+PST' | 'NONE' */
  taxType: string
  /** Tax rate in basis points (e.g. 1300 = 13.00%). 0 when IC is not registered. */
  rateBp: number
  /** Machine-readable rule that determined this result. Useful for audit trail. */
  rule: string
}

@Injectable()
export class PlaceOfSupplyService {
  constructor(private readonly db: DatabaseService) {}

  async resolve(input: ResolveInput): Promise<ResolveOutput> {
    // ── Short-circuit: IC is not registered for GST/HST ─────────────────────
    // An unregistered supplier cannot charge GST/HST regardless of where the
    // supply is made. CRA ITC rules forbid claiming input tax credits against
    // invoices from unregistered suppliers.
    if (!input.icGstHstRegistered) {
      return {
        jurisdiction: input.icDomicileProvince,
        taxType: 'NONE',
        rateBp: 0,
        rule: 'ic-not-registered',
      }
    }

    // ── Step 1: Look up the agency's GST/HST filing province ─────────────────
    // CRA general rule: place of supply = recipient (agency) address.
    const [config] = await this.db.client
      .select()
      .from(schema.agencyTaxFilingConfig)
      .where(eq(schema.agencyTaxFilingConfig.agencyId, input.agencyId))
      .limit(1)

    if (!config) {
      throw new Error(
        `No tax filing config for agency ${input.agencyId}. ` +
        `Configure the agency's GST/HST filing province before issuing invoices.`
      )
    }

    const jurisdiction = config.filingProvince

    // ── Step 2: Look up the effective tax rate for the jurisdiction ───────────
    // Pick the latest effective_from <= invoiceDate where effective_to is null
    // or >= invoiceDate (i.e., the rate was still in effect on invoiceDate).
    const [rate] = await this.db.client
      .select()
      .from(schema.taxRates)
      .where(
        and(
          eq(schema.taxRates.jurisdiction, jurisdiction),
          lte(schema.taxRates.effectiveFrom, input.invoiceDate),
          or(
            isNull(schema.taxRates.effectiveTo),
            gte(schema.taxRates.effectiveTo, input.invoiceDate),
          ),
        ),
      )
      .orderBy(sql`effective_from DESC`)
      .limit(1)

    if (!rate) {
      throw new Error(
        `No tax rate configured for ${jurisdiction} on ${input.invoiceDate}. ` +
        `Seed the tax_rates table with a row for jurisdiction='${jurisdiction}'.`
      )
    }

    return {
      jurisdiction,
      taxType: rate.taxType,
      rateBp: rate.rateBp,
      rule: 'general-recipient-address',
    }
  }
}
