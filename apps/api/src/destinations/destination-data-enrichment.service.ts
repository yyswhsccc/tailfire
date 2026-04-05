/**
 * Destination Data Enrichment Service
 *
 * Orchestrates raw data gathering (Wikipedia, country lookup, climate, timezone),
 * feeds it to an AI travel editor for curation, and stores the polished result
 * in the destinations.metadata JSONB column.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, sql, and, isNotNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { WikipediaService } from './wikipedia.service'
import { AiTravelEditorService, type RawDestinationData } from './ai-travel-editor'
import { getCountryInfo } from './country-data'

@Injectable()
export class DestinationDataEnrichmentService {
  private readonly logger = new Logger(DestinationDataEnrichmentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly wikipedia: WikipediaService,
    private readonly aiEditor: AiTravelEditorService,
  ) {}

  /**
   * Enrich a single destination with all available data + AI curation.
   */
  async enrichDestination(destinationId: string): Promise<{ success: boolean; error?: string }> {
    const { destinations } = this.db.schema

    // Fetch destination
    const [dest] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1)

    if (!dest) return { success: false, error: 'Destination not found' }

    this.logger.log(`Enriching: ${dest.name}`)

    try {
      // 1. Gather raw data (parallel where possible)
      const [wikiData, countryInfo] = await Promise.all([
        this.wikipedia.fetchSummary(dest.name),
        Promise.resolve(dest.countryCode ? getCountryInfo(dest.countryCode) : undefined),
      ])

      // 2. Compute climate zone from latitude
      const climateZone = dest.latitude
        ? this.getClimateZone(parseFloat(String(dest.latitude)))
        : undefined

      // 3. Compute UTC offset from longitude (rough approximation)
      const utcOffset = dest.longitude
        ? this.estimateUtcOffset(parseFloat(String(dest.longitude)))
        : undefined

      // 4. Build raw data for AI editor
      const rawData: RawDestinationData = {
        name: dest.name,
        type: dest.destinationType,
        country: countryInfo?.name || undefined,
        countryCode: dest.countryCode || undefined,
        coordinates: dest.latitude && dest.longitude
          ? { lat: parseFloat(String(dest.latitude)), lng: parseFloat(String(dest.longitude)) }
          : undefined,
        wikipedia: wikiData?.extract || undefined,
        climateZone,
        currency: countryInfo?.currencyName || undefined,
        language: countryInfo?.languages?.[0] || undefined,
        isCruisePort: dest.destinationType === 'port_city',
      }

      // 5. AI Curation
      const curated = await this.aiEditor.curateDestination(rawData)

      // 6. Build metadata update — merge into existing, preserving fields like airportIata
      const existingMetadata = (dest.metadata as Record<string, unknown>) || {}
      const newMetadata: Record<string, unknown> = {
        ...existingMetadata,

        // AI curated content
        ...(curated ? {
          travelDescription: curated.travelDescription,
          oneLiner: curated.oneLiner,
          highlights: curated.highlights,
          bestMonths: curated.bestMonths,
          typicalStay: curated.typicalStay,
          budgetTier: curated.budgetTier,
          travelTips: curated.travelTips,
          tags: curated.tags,
          vibeWords: curated.vibeWords,
        } : {}),

        // Country info
        ...(countryInfo ? {
          currency: countryInfo.currency,
          currencyName: countryInfo.currencyName,
          languages: countryInfo.languages,
          visaInfo: countryInfo.visaForCA,
          electricPlug: countryInfo.electricPlug,
          emergencyNumber: countryInfo.emergencyNumber,
        } : {}),

        // Climate & timezone
        ...(climateZone ? { climateZone } : {}),
        ...(utcOffset !== undefined ? { utcOffset: `UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}` } : {}),

        // Tracking
        enrichedAt: new Date().toISOString(),
        enrichmentVersion: 2,
        aiModelUsed: process.env.AI_ENRICHMENT_MODEL || 'gpt-4o-mini',
        sources: [
          ...(wikiData ? ['wikipedia'] : []),
          ...(countryInfo ? ['country'] : []),
          ...(curated ? ['ai'] : []),
          'climate',
        ],
      }

      // 7. Update destination
      await this.db.client
        .update(destinations)
        .set({
          metadata: sql`${JSON.stringify(newMetadata)}::jsonb`,
          summary: curated?.travelDescription || dest.summary,
          updatedAt: sql`NOW()`,
        })
        .where(eq(destinations.id, destinationId))

      this.logger.log(`Enriched: ${dest.name} (${curated ? 'AI curated' : 'data only'})`)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Enrichment failed for ${dest.name}: ${message}`)
      return { success: false, error: message }
    }
  }

  /**
   * Batch enrich destinations that have lat/lng but haven't been enriched yet.
   * Processes sequentially with a delay between AI calls.
   */
  async batchEnrich(
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const { destinations } = this.db.schema
    const limit = options.limit || 50
    const offset = options.offset || 0

    // Get destinations needing enrichment — those with coordinates but no travelDescription
    const rows = await this.db.client
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(
        and(
          isNotNull(destinations.latitude),
          sql`(metadata->>'travelDescription') IS NULL`,
        ),
      )
      .orderBy(destinations.name)
      .limit(limit)
      .offset(offset)

    this.logger.log(`Batch enrichment: ${rows.length} destinations (offset ${offset}, limit ${limit})`)

    let succeeded = 0
    let failed = 0

    for (const row of rows) {
      const result = await this.enrichDestination(row.id)
      if (result.success) succeeded++
      else failed++

      // Rate limit: ~1.2s between AI calls to stay within OpenAI rate limits
      await new Promise((r) => setTimeout(r, 1200))
    }

    this.logger.log(`Batch enrichment complete: ${succeeded} succeeded, ${failed} failed out of ${rows.length}`)
    return { processed: rows.length, succeeded, failed }
  }

  /**
   * Classify climate zone from latitude.
   * Simplistic but sufficient for travel content categorization.
   */
  private getClimateZone(latitude: number): string {
    const absLat = Math.abs(latitude)
    if (absLat < 10) return 'equatorial'
    if (absLat < 23.5) return 'tropical'
    if (absLat < 35) return 'subtropical'
    if (absLat < 55) return 'temperate'
    if (absLat < 66.5) return 'subarctic'
    return 'arctic'
  }

  /**
   * Estimate UTC offset from longitude (rough: 15 degrees per hour).
   */
  private estimateUtcOffset(longitude: number): number {
    return Math.round(longitude / 15)
  }
}
