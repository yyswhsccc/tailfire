/**
 * IcPayoutAuthorizationsService
 *
 * Manages RCTI (Recipient-Created Tax Invoice) agreement acceptance for IC agents.
 *
 * On accept():
 *  1. Renders an agreement PDF (with embedded signature) via RctiPdfService.
 *  2. Uploads both the PDF and raw signature PNG to document storage.
 *  3. In a single transaction:
 *     - Supersedes any previous active authorization for this user.
 *     - Inserts the new active authorization record.
 *     - Updates ic_tax_profiles.rcti_authorization_id to point to the new record.
 *
 * Storage paths follow StorageService.uploadDocument() convention:
 *   componentId = 'ic-payouts/authorizations/{userId}'
 *   path built by service as: {componentId}/{timestamp}-{fileName}
 */

import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { StorageService } from '../../trips/storage.service'
import { schema } from '@tailfire/database'
import { rctiAgreementText, RCTI_AGREEMENT_VERSION } from './rcti-template'
import { RctiPdfService } from './rcti-pdf.service'

const { icPayoutAuthorizations, icTaxProfiles } = schema

type IcPayoutAuthorization = typeof icPayoutAuthorizations.$inferSelect

export interface AcceptRctiInput {
  agencyId: string
  userId: string
  agencyLegalName: string
  icLegalName: string
  acceptedIp: string
  signaturePngBytes: Buffer
  payerTaxRegistrationAttested: boolean
  recipientTaxRegistrationAttested: boolean
}

@Injectable()
export class IcPayoutAuthorizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly pdf: RctiPdfService,
  ) {}

  async accept(input: AcceptRctiInput): Promise<IcPayoutAuthorization> {
    const text = rctiAgreementText({
      agencyLegalName: input.agencyLegalName,
      icLegalName: input.icLegalName,
    })
    const textHash = createHash('sha256').update(text).digest('hex')

    // 1. Render PDF with embedded signature
    const pdfBytes = await this.pdf.render({
      text,
      signaturePngBytes: input.signaturePngBytes,
    })

    // 2. Upload PDF and raw signature to document storage.
    //    StorageService.uploadDocument(file, componentId, fileName, contentType)
    //    builds path as: {componentId}/{timestamp}-{fileName}
    const componentId = `ic-payouts/authorizations/${input.userId}`
    const agreementPath = await this.storage.uploadDocument(
      pdfBytes,
      componentId,
      `${RCTI_AGREEMENT_VERSION}.pdf`,
      'application/pdf',
    )
    const signaturePath = await this.storage.uploadDocument(
      input.signaturePngBytes,
      componentId,
      `sig-${RCTI_AGREEMENT_VERSION}.png`,
      'image/png',
    )

    // 3. Atomic: supersede prior active auth, insert new active auth, update tax profile
    const created = await this.db.client.transaction(async (tx) => {
      // Supersede any existing active authorization for this user
      await tx.update(icPayoutAuthorizations)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(and(
          eq(icPayoutAuthorizations.userId, input.userId),
          eq(icPayoutAuthorizations.status, 'active'),
        ))

      // Insert the new active authorization
      const rows = await tx.insert(icPayoutAuthorizations).values({
        agencyId: input.agencyId,
        userId: input.userId,
        agreementVersion: RCTI_AGREEMENT_VERSION,
        agreementTextHash: textHash,
        agreementPdfStoragePath: agreementPath,
        signaturePngStoragePath: signaturePath,
        acceptedAt: new Date(),
        acceptedIp: input.acceptedIp,
        payerTaxRegistrationAttested: input.payerTaxRegistrationAttested,
        recipientTaxRegistrationAttested: input.recipientTaxRegistrationAttested,
        status: 'active',
        createdBy: input.userId,
        updatedBy: input.userId,
      }).returning()

      const newAuth = rows[0]
      if (!newAuth) {
        throw new Error('Insert of ic_payout_authorizations returned no rows')
      }

      // Update ic_tax_profiles to reference the new active authorization
      await tx.update(icTaxProfiles)
        .set({ rctiAuthorizationId: newAuth.id, updatedAt: new Date() })
        .where(and(
          eq(icTaxProfiles.agencyId, input.agencyId),
          eq(icTaxProfiles.userId, input.userId),
        ))

      return newAuth
    })

    return created
  }

  async getActive(agencyId: string, userId: string): Promise<IcPayoutAuthorization | null> {
    const [row] = await this.db.client
      .select()
      .from(icPayoutAuthorizations)
      .where(and(
        eq(icPayoutAuthorizations.agencyId, agencyId),
        eq(icPayoutAuthorizations.userId, userId),
        eq(icPayoutAuthorizations.status, 'active'),
      ))
      .limit(1)
    return row ?? null
  }
}
