import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { EncryptionService } from '../../common/encryption/encryption.service'
import { schema } from '@tailfire/database'

type IcTaxProfile = typeof schema.icTaxProfiles.$inferSelect
type NewIcTaxProfile = typeof schema.icTaxProfiles.$inferInsert

export interface CreateIcTaxProfileInput {
  legalName: string
  domicileAddress: Record<string, unknown>
  domicileProvince: string
  isCorporation: boolean
  sinOrBn: string                    // raw — encrypted on insert
  gstHstRegistered: boolean
  gstHstNumber?: string
  gstHstEffectiveFrom?: string       // YYYY-MM-DD
}

export interface UpdateIcTaxProfileInput {
  legalName?: string
  domicileAddress?: Record<string, unknown>
  domicileProvince?: string
  gstHstRegistered?: boolean
  gstHstNumber?: string
  sinOrBn?: string
  approvalCeilingCents?: number
  autoDisburse?: boolean
}

export interface UpdateContext {
  isAdmin: boolean
}

@Injectable()
export class IcTaxProfilesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(agencyId: string, userId: string, input: CreateIcTaxProfileInput): Promise<IcTaxProfile> {
    const { ciphertext, keyVersion } = this.encryption.encryptWithVersion(input.sinOrBn)
    const mask = this.maskTaxId(input.sinOrBn)
    const [created] = await this.db.client.insert(schema.icTaxProfiles).values({
      agencyId,
      userId,
      legalName: input.legalName,
      domicileAddress: input.domicileAddress as any,
      domicileProvince: input.domicileProvince,
      isCorporation: input.isCorporation,
      sinOrBnEncrypted: ciphertext,
      encryptionKeyVersion: keyVersion,
      sinOrBnMask: mask,
      gstHstRegistered: input.gstHstRegistered,
      gstHstNumber: input.gstHstNumber,
      gstHstEffectiveFrom: input.gstHstEffectiveFrom,
      createdBy: userId,
      updatedBy: userId,
    } satisfies NewIcTaxProfile).returning()
    return created!
  }

  async findByUser(agencyId: string, userId: string): Promise<IcTaxProfile | null> {
    const [row] = await this.db.client.select().from(schema.icTaxProfiles)
      .where(and(eq(schema.icTaxProfiles.agencyId, agencyId), eq(schema.icTaxProfiles.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async update(
    agencyId: string,
    userId: string,
    patch: UpdateIcTaxProfileInput,
    ctx: UpdateContext,
  ): Promise<IcTaxProfile> {
    if ((patch.approvalCeilingCents !== undefined || patch.autoDisburse !== undefined) && !ctx.isAdmin) {
      throw new ForbiddenException('Admin role required to change disbursement policy')
    }
    const profile = await this.findByUser(agencyId, userId)
    if (!profile) throw new NotFoundException('IC tax profile not found')

    const updates: Partial<NewIcTaxProfile> = {}
    if (patch.legalName !== undefined) updates.legalName = patch.legalName
    if (patch.domicileAddress !== undefined) updates.domicileAddress = patch.domicileAddress as any
    if (patch.domicileProvince !== undefined) updates.domicileProvince = patch.domicileProvince
    if (patch.gstHstRegistered !== undefined) updates.gstHstRegistered = patch.gstHstRegistered
    if (patch.gstHstNumber !== undefined) updates.gstHstNumber = patch.gstHstNumber
    if (patch.approvalCeilingCents !== undefined) updates.approvalCeilingCents = patch.approvalCeilingCents
    if (patch.autoDisburse !== undefined) updates.autoDisburse = patch.autoDisburse
    if (patch.sinOrBn !== undefined) {
      const { ciphertext, keyVersion } = this.encryption.encryptWithVersion(patch.sinOrBn)
      updates.sinOrBnEncrypted = ciphertext
      updates.encryptionKeyVersion = keyVersion
      updates.sinOrBnMask = this.maskTaxId(patch.sinOrBn)
    }

    const [updated] = await this.db.client.update(schema.icTaxProfiles)
      .set({ ...updates, updatedBy: userId, updatedAt: new Date() })
      .where(eq(schema.icTaxProfiles.id, profile.id))
      .returning()
    return updated!
  }

  /**
   * Decrypts and returns the raw SIN/BN.
   * Should ONLY be called from internal services (T4ASlipService) or admin-authorized endpoints.
   *
   * @param profileId   - UUID of the ic_tax_profiles row
   * @param requestedBy - userId of the requester (for audit trail)
   * @param reason      - Human-readable reason (e.g. 'T4A export', 'compliance review')
   */
  async getDecryptedTaxId(profileId: string, _requestedBy: string, _reason: string): Promise<string> {
    const [profile] = await this.db.client.select().from(schema.icTaxProfiles)
      .where(eq(schema.icTaxProfiles.id, profileId)).limit(1)
    if (!profile) throw new NotFoundException('IC tax profile not found')
    if (!profile.sinOrBnEncrypted || profile.encryptionKeyVersion == null) {
      throw new NotFoundException('No tax id stored on this profile')
    }
    // TODO(Task 12): emit audit event 'sensitive_decrypt' with
    //   { entity: 'ic_tax_profile', id: profileId, requestedBy: _requestedBy, reason: _reason }
    return this.encryption.decryptWithVersion(profile.sinOrBnEncrypted, profile.encryptionKeyVersion)
  }

  /**
   * Masks a tax ID string, preserving separators.
   * Replaces all digits except the last 4 characters with '*'.
   *
   * Examples:
   *   '123-456-789' → '***-***-789'  (SIN with hyphens)
   *   '12356789'    → '***56789'      (8-digit BN fragment)
   */
  maskTaxId(taxId: string): string {
    const cleaned = taxId.trim()
    if (cleaned.length <= 4) {
      return '*'.repeat(Math.max(cleaned.length - 1, 0)) + cleaned.slice(-1)
    }
    const tail = cleaned.slice(-4)   // keep last 4 chars verbatim (digits + non-digits)
    const head = cleaned.slice(0, -4)
    return head.replace(/\d/g, '*') + tail
  }
}
