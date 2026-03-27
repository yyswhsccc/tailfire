/**
 * OTA Referrals Service
 *
 * Logs referral sessions from the OTA consumer portal.
 * Called by middleware when an advisor slug is detected in the URL.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CreateReferralDto } from './dto/create-referral.dto'

@Injectable()
export class OtaReferralsService {
  private readonly logger = new Logger(OtaReferralsService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Log a referral session.
   *
   * Inserts into ota_referrals with session tracking info.
   * Optionally resolves the advisor's agencyId from advisor_profiles.
   */
  async logReferral(dto: CreateReferralDto): Promise<{ id: string }> {
    const { otaReferrals, advisorProfiles } = this.db.schema

    // Resolve advisor's agencyId and profileId from the slug (if the advisor exists)
    let agencyId: string | null = null
    let advisorProfileId: string | null = null
    const [advisor] = await this.db.client
      .select({ id: advisorProfiles.id, agencyId: advisorProfiles.agencyId })
      .from(advisorProfiles)
      .where(eq(advisorProfiles.slug, dto.advisorSlug))
      .limit(1)

    if (advisor) {
      agencyId = advisor.agencyId
      advisorProfileId = advisor.id
    }

    // Calculate cookie expiry (30 days from now)
    const cookieExpiry = new Date()
    cookieExpiry.setDate(cookieExpiry.getDate() + 30)

    const [referral] = await this.db.client
      .insert(otaReferrals)
      .values({
        sessionId: dto.sessionId,
        advisorSlug: dto.advisorSlug,
        advisorProfileId,
        landingUrl: dto.landingUrl ?? null,
        referralSource: dto.referralSource,
        agencyId,
        cookieExpiry,
      })
      .returning({ id: otaReferrals.id })

    this.logger.log(
      `Referral logged: session=${dto.sessionId}, advisor=${dto.advisorSlug}, source=${dto.referralSource}`,
    )

    return { id: referral!.id }
  }
}
