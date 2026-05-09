import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { EncryptionService } from '../../common/encryption/encryption.service'
import { schema } from '@tailfire/database'

type IcPayoutAccount = typeof schema.icPayoutAccounts.$inferSelect
type NewIcPayoutAccount = typeof schema.icPayoutAccounts.$inferInsert

export type Rail = 'interac_etransfer' | 'eft' | 'wise' | 'wire' | 'visa_direct'

export interface CreatePayoutAccountInput {
  label: string
  currency: string
  rail: Rail
  details: Record<string, unknown>
  isDefaultForCurrency?: boolean
  padAgreementVersion?: string
  padAcceptedIp?: string
}

@Injectable()
export class IcPayoutAccountsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(agencyId: string, userId: string, input: CreatePayoutAccountInput): Promise<IcPayoutAccount> {
    // 1. Require active RCTI authorization
    const [profile] = await this.db.client
      .select()
      .from(schema.icTaxProfiles)
      .where(
        and(
          eq(schema.icTaxProfiles.agencyId, agencyId),
          eq(schema.icTaxProfiles.userId, userId),
        ),
      )
      .limit(1)

    if (!profile?.rctiAuthorizationId) {
      throw new ForbiddenException(
        'Active RCTI authorization required before adding payout accounts',
      )
    }

    // 2. Rail-specific field validation
    this.validateRailDetails(input.rail, input.details)

    // 3. EFT requires PAD agreement
    if (input.rail === 'eft' && !input.padAgreementVersion) {
      throw new BadRequestException('PAD agreement version required for EFT accounts')
    }

    // 4. Build mask + encrypt details
    const mask = this.maskDetails(input.rail, input.details)
    const { ciphertext, keyVersion } = this.encryption.encryptWithVersion(
      JSON.stringify(input.details),
    )

    // 5. Atomic insert + default-swap in a single transaction
    return await this.db.client.transaction(async (tx) => {
      if (input.isDefaultForCurrency) {
        // Clear any existing default for this (user, currency) pair
        await tx
          .update(schema.icPayoutAccounts)
          .set({ isDefaultForCurrency: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.icPayoutAccounts.userId, userId),
              eq(schema.icPayoutAccounts.currency, input.currency),
              eq(schema.icPayoutAccounts.isDefaultForCurrency, true),
            ),
          )
      }

      const [created] = await tx
        .insert(schema.icPayoutAccounts)
        .values({
          agencyId,
          userId,
          label: input.label,
          currency: input.currency,
          rail: input.rail,
          isDefaultForCurrency: input.isDefaultForCurrency ?? false,
          status: 'unverified',
          detailsEncrypted: ciphertext,
          encryptionKeyVersion: keyVersion,
          detailsMask: mask,
          padAgreementVersion: input.padAgreementVersion,
          padAcceptedAt: input.padAgreementVersion ? new Date() : undefined,
          padAcceptedIp: input.padAcceptedIp,
          createdBy: userId,
          updatedBy: userId,
        } satisfies NewIcPayoutAccount)
        .returning()

      return created!
    })
  }

  async listForUser(agencyId: string, userId: string): Promise<IcPayoutAccount[]> {
    return await this.db.client
      .select()
      .from(schema.icPayoutAccounts)
      .where(
        and(
          eq(schema.icPayoutAccounts.agencyId, agencyId),
          eq(schema.icPayoutAccounts.userId, userId),
        ),
      )
  }

  /**
   * Decrypts and returns the raw payout account details.
   * Should only be called from internal services (payout disbursement) or admin endpoints.
   *
   * @param accountId   - UUID of the ic_payout_accounts row
   * @param requestedBy - userId of the requester (for audit trail)
   * @param reason      - Human-readable reason (e.g. 'disbursement', 'verification')
   */
  async getDecryptedDetails(
    accountId: string,
    _requestedBy: string,
    _reason: string,
  ): Promise<Record<string, unknown>> {
    const [acct] = await this.db.client
      .select()
      .from(schema.icPayoutAccounts)
      .where(eq(schema.icPayoutAccounts.id, accountId))
      .limit(1)

    if (!acct) throw new BadRequestException('Payout account not found')

    // TODO(Task 12): emit audit event 'sensitive_decrypt' with
    //   { entity: 'ic_payout_account', id: accountId, requestedBy: _requestedBy, reason: _reason }
    const json = this.encryption.decryptWithVersion(
      acct.detailsEncrypted,
      acct.encryptionKeyVersion,
    )
    return JSON.parse(json) as Record<string, unknown>
  }

  async archive(agencyId: string, userId: string, accountId: string): Promise<void> {
    await this.db.client
      .update(schema.icPayoutAccounts)
      .set({ status: 'archived', isDefaultForCurrency: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.icPayoutAccounts.id, accountId),
          eq(schema.icPayoutAccounts.agencyId, agencyId),
          eq(schema.icPayoutAccounts.userId, userId),
        ),
      )
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private validateRailDetails(rail: Rail, details: Record<string, unknown>): void {
    switch (rail) {
      case 'interac_etransfer':
        if (!details.email || typeof details.email !== 'string') {
          throw new BadRequestException('Interac e-Transfer requires a valid email address')
        }
        return

      case 'eft':
        if (!details.institution || !details.transit || !details.account) {
          throw new BadRequestException(
            'EFT requires institution number, transit number, and account number',
          )
        }
        return

      case 'wise':
        if (!details.email) {
          throw new BadRequestException('Wise requires an email address')
        }
        return

      case 'wire':
        if (!details.swift || !details.account) {
          throw new BadRequestException(
            'Wire transfer requires a SWIFT/BIC code and account number',
          )
        }
        return

      case 'visa_direct':
        if (!details.cardLast4) {
          throw new BadRequestException('Visa Direct requires card details (cardLast4)')
        }
        return

      default: {
        // Exhaustiveness check
        const _never: never = rail
        throw new BadRequestException(`Unknown payment rail: ${_never}`)
      }
    }
  }

  private maskDetails(rail: Rail, details: Record<string, unknown>): string {
    if (rail === 'interac_etransfer' || rail === 'wise') {
      const email = (details.email as string) ?? ''
      const [local, domain] = email.split('@')
      return `${local?.[0] ?? '*'}***@${domain ?? '?'}`
    }

    if (rail === 'eft') {
      const acct = (details.account as string) ?? ''
      return `***${acct.slice(-4)}`
    }

    if (rail === 'wire') {
      const acct = (details.account as string) ?? ''
      const swift = (details.swift as string) ?? '?'
      return `${swift.slice(0, 4)}…***${acct.slice(-4)}`
    }

    if (rail === 'visa_direct') {
      return `Visa ****${details.cardLast4 ?? '?'}`
    }

    return '***'
  }
}
