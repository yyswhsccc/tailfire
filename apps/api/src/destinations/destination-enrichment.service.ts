/**
 * Destination Enrichment Service
 *
 * Orchestrates enrichment of destinations from external sources (TripAdvisor
 * via SerpAPI). Implements cache-on-demand with optimistic locking, stale
 * refresh, and error recovery with consecutive failure tracking.
 */

import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { SerpApiService } from './serpapi.service'
import { UnsplashService } from './unsplash.service'
import { eq, and, lte, sql } from 'drizzle-orm'

@Injectable()
export class DestinationEnrichmentService {
  private readonly logger = new Logger(DestinationEnrichmentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly serpApi: SerpApiService,
    private readonly unsplash: UnsplashService,
  ) {}

  /**
   * Enrich a single destination with TripAdvisor data via SerpAPI.
   * Implements cache-on-demand with optimistic locking.
   */
  async enrichDestination(
    destinationId: string,
  ): Promise<{ status: string; source?: string }> {
    if (!this.serpApi.isConfigured()) {
      return { status: 'skipped', source: 'serpapi_not_configured' }
    }

    const { destinations, destinationCache } = this.db.schema

    // 1. Get destination
    const [dest] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1)

    if (!dest) return { status: 'not_found' }

    // 2. Check existing cache
    const [existing] = await this.db.client
      .select()
      .from(destinationCache)
      .where(
        and(
          eq(destinationCache.destinationId, destinationId),
          eq(destinationCache.source, 'tripadvisor'),
        ),
      )
      .limit(1)

    if (
      existing &&
      existing.status === 'fresh' &&
      existing.refreshAfterAt &&
      new Date(existing.refreshAfterAt) > new Date()
    ) {
      return { status: 'cache_hit', source: 'tripadvisor' }
    }

    // 3. Acquire lock (simple optimistic lock)
    const lockToken = crypto.randomUUID()
    const lockExpires = new Date(Date.now() + 5 * 60 * 1000) // 5 min lock

    if (existing) {
      // Check if already locked by another worker
      if (
        existing.lockToken &&
        existing.lockExpiresAt &&
        new Date(existing.lockExpiresAt) > new Date()
      ) {
        return { status: 'locked' }
      }

      // Update lock
      await this.db.client
        .update(destinationCache)
        .set({ lockToken, lockExpiresAt: lockExpires, status: 'refreshing' })
        .where(eq(destinationCache.id, existing.id))
    }

    // 4. Fetch from SerpAPI
    const searchQuery = dest.countryCode
      ? `${dest.name} ${dest.countryCode} things to do`
      : `${dest.name} things to do`

    const result = await this.serpApi.searchTripAdvisor(searchQuery)

    if (!result || result.results.length === 0) {
      // Record failure
      if (existing) {
        await this.db.client
          .update(destinationCache)
          .set({
            status: 'failed',
            lastErrorMessage: 'No results from SerpAPI',
            consecutiveFailures: sql`${destinationCache.consecutiveFailures} + 1`,
            lockToken: null,
            lockExpiresAt: null,
          })
          .where(eq(destinationCache.id, existing.id))
      }
      return { status: 'no_results' }
    }

    // 5. Parse and normalize
    const topResult = result.results[0]!
    const normalizedPayload = {
      topResults: result.results.slice(0, 5).map((r) => ({
        title: r.title,
        rating: r.rating,
        reviewsCount: r.reviewsCount,
        description: r.description,
        thumbnailUrl: r.thumbnailUrl,
        categories: r.categories,
      })),
      photos: result.results.flatMap((r) => r.photos).slice(0, 20),
      averageRating:
        result.results.reduce((sum, r) => sum + r.rating, 0) /
          result.results.length || 0,
      totalReviewCount: result.results.reduce(
        (sum, r) => sum + r.reviewsCount,
        0,
      ),
    }

    const summaryMd =
      topResult.description ||
      `Explore ${dest.name} — rated ${normalizedPayload.averageRating.toFixed(1)} on TripAdvisor.`
    const heroImageUrl =
      topResult.thumbnailUrl || normalizedPayload.photos[0]?.url || null
    const payloadHash = Buffer.from(JSON.stringify(normalizedPayload))
      .toString('base64')
      .slice(0, 64)

    const now = new Date()
    const refreshAfter = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // 6. Upsert cache record
    const cacheValues = {
      destinationId,
      source: 'tripadvisor' as const,
      locale: 'en',
      status: 'fresh' as const,
      cacheKey: `tripadvisor:${destinationId}:en`,
      rawPayload: result,
      normalizedPayload,
      summaryMd,
      sourceUrls: result.results.map((r) => r.link).filter(Boolean),
      fetchedAt: now,
      lastSuccessAt: now,
      refreshAfterAt: refreshAfter,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      lastHttpStatus: 200,
      lastErrorCode: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      fetchCount: existing ? (existing.fetchCount ?? 0) + 1 : 1,
      payloadHash,
      lockToken: null,
      lockExpiresAt: null,
      costUnits: '1.0',
    }

    if (existing) {
      await this.db.client
        .update(destinationCache)
        .set(cacheValues)
        .where(eq(destinationCache.id, existing.id))
    } else {
      await this.db.client.insert(destinationCache).values(cacheValues)
    }

    // 7. Update destination with enriched content
    await this.db.client
      .update(destinations)
      .set({
        contentStatus: 'enriched',
        summary: summaryMd,
        heroImageUrl: heroImageUrl,
      })
      .where(eq(destinations.id, destinationId))

    this.logger.log(
      `Enriched destination "${dest.name}" — ${result.results.length} results, hero image: ${heroImageUrl ? 'yes' : 'no'}`,
    )

    return { status: 'enriched', source: 'tripadvisor' }
  }

  /**
   * Refresh all stale destinations.
   * Finds cache entries past their refresh_after_at timestamp and re-enriches them.
   */
  async refreshStaleDestinations(
    limit = 50,
  ): Promise<{ refreshed: number; failed: number }> {
    const { destinationCache } = this.db.schema
    const now = new Date()

    // Find stale, unlocked cache entries
    const staleEntries = await this.db.client
      .select({ destinationId: destinationCache.destinationId })
      .from(destinationCache)
      .where(
        and(
          eq(destinationCache.source, 'tripadvisor'),
          lte(destinationCache.refreshAfterAt, now),
          // Not locked
          sql`(${destinationCache.lockToken} IS NULL OR ${destinationCache.lockExpiresAt} < ${now.toISOString()})`,
        ),
      )
      .limit(limit)

    let refreshed = 0
    let failed = 0

    for (const entry of staleEntries) {
      const result = await this.enrichDestination(entry.destinationId)
      if (result.status === 'enriched') {
        refreshed++
      } else {
        failed++
      }
    }

    this.logger.log(
      `Stale refresh: ${refreshed} refreshed, ${failed} failed out of ${staleEntries.length}`,
    )
    return { refreshed, failed }
  }

  /**
   * Backfill hero images for destinations that don't have one.
   * Uses Unsplash as a lightweight fallback (no full TripAdvisor enrichment).
   */
  async backfillHeroImages(limit = 500): Promise<{ updated: number; skipped: number; failed: number }> {
    if (!this.unsplash.isConfigured()) {
      this.logger.warn('Unsplash not configured — cannot backfill hero images')
      return { updated: 0, skipped: 0, failed: 0 }
    }

    const { destinations } = this.db.schema

    // Find destinations without hero images
    const missing = await this.db.client
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(sql`hero_image_url IS NULL`)
      .orderBy(destinations.name)
      .limit(limit)

    this.logger.log(`Found ${missing.length} destinations without hero images (limit: ${limit})`)

    let updated = 0
    let skipped = 0
    let failed = 0

    for (let i = 0; i < missing.length; i++) {
      const dest = missing[i]!

      // Search Unsplash for this destination
      const result = await this.unsplash.searchPhoto(dest.name)

      if (!result) {
        skipped++
        continue
      }

      try {
        await this.db.client
          .update(destinations)
          .set({
            heroImageUrl: result.imageUrl,
            // Store attribution in metadata
            metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{unsplash_attribution}', ${JSON.stringify(result.attribution)}::jsonb)`,
          })
          .where(eq(destinations.id, dest.id))

        updated++
      } catch (error) {
        failed++
        if (failed <= 5) {
          this.logger.error(`Failed to update hero image for "${dest.name}": ${error}`)
        }
      }

      if ((i + 1) % 50 === 0) {
        this.logger.log(`Hero image backfill progress: ${i + 1}/${missing.length} (${updated} updated, ${skipped} skipped, ${failed} failed)`)
      }
    }

    this.logger.log(`Hero image backfill complete: ${updated} updated, ${skipped} skipped, ${failed} failed`)
    return { updated, skipped, failed }
  }
}
