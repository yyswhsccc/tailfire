import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { eq, sql } from 'drizzle-orm'

@Injectable()
export class SailingSlugService {
  private readonly logger = new Logger(SailingSlugService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate a short, URL-safe public ID using Crockford Base32.
   * 8 characters = ~40 bits of entropy (~1 trillion combinations).
   */
  private generatePublicId(): string {
    const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford Base32
    const bytes = new Uint8Array(5) // 40 bits
    crypto.getRandomValues(bytes)
    let result = ''
    let bits = 0
    let value = 0
    for (const byte of bytes) {
      value = (value << 8) | byte
      bits += 8
      while (bits >= 5) {
        bits -= 5
        result += chars[(value >> bits) & 0x1f]
      }
    }
    return result
  }

  /**
   * Generate a slug_base from sailing attributes.
   * Format: ship-name-YYYY-MM-DD-Xn-from-port
   * Example: harmony-of-the-seas-2026-11-14-7n-from-miami
   */
  private generateSlugBase(
    shipName: string,
    sailDate: string,
    nights: number,
    embarkPortName: string | null,
  ): string {
    const shipSlug = shipName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const portSlug = embarkPortName
      ? embarkPortName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      : 'unknown'
    return `${shipSlug}-${sailDate}-${nights}n-from-${portSlug}`
  }

  /**
   * Generate public_ids and slug_bases for all sailings that don't have them.
   * ONLY works on Production where catalog tables are real (not FDW).
   */
  async generatePublicIds(): Promise<{ updated: number; errors: number }> {
    const { cruiseSailings, cruiseShips, cruisePorts } = this.db.schema

    // Check if public_id column exists (it won't on dev/preview FDW)
    try {
      await this.db.client.execute(
        sql`SELECT public_id FROM catalog.cruise_sailings LIMIT 0`,
      )
    } catch {
      this.logger.warn(
        'public_id column not found on cruise_sailings — this is a FDW environment. Skipping.',
      )
      return { updated: 0, errors: 0 }
    }

    // Get all sailings without public_id
    const sailings = await this.db.client
      .select({
        id: cruiseSailings.id,
        sailDate: cruiseSailings.sailDate,
        nights: cruiseSailings.nights,
        shipName: cruiseShips.name,
        embarkPortName: cruisePorts.name,
      })
      .from(cruiseSailings)
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .leftJoin(cruisePorts, eq(cruiseSailings.embarkPortId, cruisePorts.id))
      .where(sql`${cruiseSailings.publicId} IS NULL`)

    this.logger.log(`Found ${sailings.length} sailings without public_id`)

    if (sailings.length === 0) return { updated: 0, errors: 0 }

    let updated = 0
    let errors = 0
    const BATCH_SIZE = 500

    // Generate unique public_ids
    const usedIds = new Set<string>()

    for (let i = 0; i < sailings.length; i += BATCH_SIZE) {
      const batch = sailings.slice(i, i + BATCH_SIZE)

      for (const sailing of batch) {
        try {
          let publicId: string
          do {
            publicId = this.generatePublicId()
          } while (usedIds.has(publicId))
          usedIds.add(publicId)

          const slugBase = this.generateSlugBase(
            sailing.shipName || 'unknown',
            sailing.sailDate,
            sailing.nights,
            sailing.embarkPortName || null,
          )

          await this.db.client
            .update(cruiseSailings)
            .set({ publicId, slugBase })
            .where(eq(cruiseSailings.id, sailing.id))

          updated++
        } catch (error) {
          errors++
          if (errors <= 5) {
            this.logger.error(
              `Failed to update sailing ${sailing.id}: ${error}`,
            )
          }
        }
      }

      this.logger.log(
        `Progress: ${Math.min(i + BATCH_SIZE, sailings.length)}/${sailings.length} (${updated} updated, ${errors} errors)`,
      )
    }

    this.logger.log(
      `Slug generation complete: ${updated} updated, ${errors} errors`,
    )
    return { updated, errors }
  }
}
