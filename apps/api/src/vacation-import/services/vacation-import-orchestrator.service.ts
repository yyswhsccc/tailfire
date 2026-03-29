/**
 * Vacation Import Orchestrator Service
 *
 * Coordinates the full vacation catalog sync from the Softvoyage VCO API:
 * - Environment guard (production-only by default)
 * - PostgreSQL advisory lock to prevent concurrent runs
 * - Fetches gateways, destinations, and hotels
 * - Change detection (insert / update / unchanged / deactivate buckets)
 * - Upserts structured records into catalog.vacation_* tables
 * - Soft-deletes stale records absent from the upstream feed
 * - Records sync history with metrics
 * - Daily CRON at 04:00 Toronto time
 *
 * IMPORTANT: This service should ONLY run on Production (api.tailfire.ca).
 * Dev and Preview environments use FDW (Foreign Data Wrapper) to read
 * catalog data directly from Production. Running sync on non-prod will
 * create local tables that break the FDW architecture.
 *
 * See CLAUDE.md "Critical Rule #3" for details.
 */

import { Injectable, Logger, ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { sql, eq, and, lt, desc } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { SoftvoyageCatalogClientService, type VcoHotel } from './softvoyage-catalog-client.service'
import { ChangeDetectorService } from './change-detector.service'
import {
  vacationGateways,
  vacationDestinations,
  vacationHotels,
  vacationGatewayDestinations,
  vacationSyncHistory,
} from '@tailfire/database'

// ============================================================================
// TYPES
// ============================================================================

interface SyncMetrics {
  gatewaysFound: number
  destinationsFound: number
  hotelsFound: number
  hotelsInserted: number
  hotelsUpdated: number
  hotelsUnchanged: number
  hotelsSoftDeleted: number
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class VacationImportOrchestratorService {
  private readonly logger = new Logger(VacationImportOrchestratorService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly catalogClient: SoftvoyageCatalogClientService,
    private readonly changeDetector: ChangeDetectorService,
  ) {}

  // ============================================================================
  // MAIN SYNC ENTRY POINT
  // ============================================================================

  async runSync(options?: { dryRun?: boolean }): Promise<SyncMetrics> {
    const dryRun = options?.dryRun ?? false

    // =========================================================================
    // ENVIRONMENT GUARD: Only Production should run vacation sync!
    // Dev and Preview environments use FDW to read from Production.
    // =========================================================================
    const apiUrl = this.configService.get<string>('API_URL') || ''
    const isProduction = apiUrl.includes('api.tailfire.ca')
    const bypassGuard = this.configService.get('BYPASS_SYNC_ENVIRONMENT_GUARD') === 'true'

    if (!isProduction && !bypassGuard) {
      throw new Error(
        'Vacation sync is only allowed on Production (api.tailfire.ca). ' +
        'Dev and Preview environments use FDW to read catalog data from Production. ' +
        'Set BYPASS_SYNC_ENVIRONMENT_GUARD=true to override.'
      )
    }

    // =========================================================================
    // ADVISORY LOCK: Prevent concurrent sync runs
    // =========================================================================
    const lockResult = await this.db.db.execute(
      sql`SELECT pg_try_advisory_lock(hashtext('vacation_catalog_sync')) as acquired`
    )
    const lockRow = (lockResult as any)[0]
    const lockAcquired = lockRow?.acquired === true

    if (!lockAcquired) {
      this.logger.warn('Vacation catalog sync already in progress — advisory lock not acquired')
      throw new ConflictException('Vacation catalog sync already in progress')
    }

    const syncStartedAt = new Date()
    const errors: Array<{ message: string; context?: string }> = []

    // Create sync history record
    const [syncRecord] = await this.db.db
      .insert(vacationSyncHistory)
      .values({
        provider: 'softvoyage',
        status: 'running',
        startedAt: syncStartedAt,
        metrics: {},
        errors: [],
      })
      .returning({ id: vacationSyncHistory.id })

    const syncHistoryId = syncRecord!.id

    const metrics: SyncMetrics = {
      gatewaysFound: 0,
      destinationsFound: 0,
      hotelsFound: 0,
      hotelsInserted: 0,
      hotelsUpdated: 0,
      hotelsUnchanged: 0,
      hotelsSoftDeleted: 0,
    }

    try {
      this.logger.log(`Starting vacation catalog sync${dryRun ? ' [DRY RUN]' : ''} (syncId=${syncHistoryId})`)

      // ======================================================================
      // STEP 1: Fetch all gateways
      // ======================================================================
      const gateways = await this.catalogClient.fetchGateways()
      metrics.gatewaysFound = gateways.length
      this.logger.log(`Fetched ${gateways.length} gateways`)

      // ======================================================================
      // STEP 2: Upsert gateways
      // ======================================================================
      const gatewayIdByAirportCode = new Map<string, string>()

      if (!dryRun) {
        for (const gateway of gateways) {
          const hash = this.changeDetector.computeHash({
            name: gateway.name,
            airportCode: gateway.airportCode,
          })

          const record = {
            provider: 'softvoyage' as const,
            providerIdentifier: gateway.airportCode,
            name: gateway.name,
            airportCode: gateway.airportCode,
            isActive: true,
            lastSyncedAt: syncStartedAt,
            contentHash: hash,
            updatedAt: syncStartedAt,
          }

          const [upserted] = await this.db.db
            .insert(vacationGateways)
            .values(record)
            .onConflictDoUpdate({
              target: [vacationGateways.provider, vacationGateways.providerIdentifier],
              set: {
                name: record.name,
                airportCode: record.airportCode,
                isActive: record.isActive,
                lastSyncedAt: record.lastSyncedAt,
                contentHash: record.contentHash,
                updatedAt: record.updatedAt,
              },
            })
            .returning({ id: vacationGateways.id })

          if (upserted) {
            gatewayIdByAirportCode.set(gateway.airportCode, upserted.id)
          }
        }
      }

      // ======================================================================
      // STEP 3: Fetch destinations + hotels per gateway, upsert all
      // ======================================================================

      // Track all destination IDs seen in this sync (across all gateways)
      const allSeenDestinationIds = new Set<string>()

      for (const gateway of gateways) {
        this.logger.log(`Processing gateway ${gateway.airportCode} (${gateway.name})`)

        // Fetch destinations for this gateway
        const allDestinations = await this.catalogClient.fetchDestinations(gateway.airportCode)

        // Filter out group/separator destinations
        const individualDestinations = allDestinations.filter((d) => !d.isGroup)
        metrics.destinationsFound += individualDestinations.length

        this.logger.log(
          `Gateway ${gateway.airportCode}: ${individualDestinations.length} individual destinations (${allDestinations.length - individualDestinations.length} groups filtered)`
        )

        // Track gateway→destination links for junction table rebuild
        const gatewayDestinationIds: string[] = []

        // ====================================================================
        // STEP 4: Upsert destinations
        // ====================================================================
        const destinationIdByProviderId = new Map<string, string>()

        if (!dryRun) {
          for (const dest of individualDestinations) {
            // Parse primary country code (take first if comma-separated)
            const primaryCountryCode = dest.countryCodes
              ? dest.countryCodes.split(',')[0]?.trim() || null
              : null

            const hash = this.changeDetector.computeHash({
              name: dest.name,
              id: dest.id,
              countryCodes: dest.countryCodes,
              durations: dest.durations,
            })

            const record = {
              provider: 'softvoyage' as const,
              providerIdentifier: dest.id,
              name: dest.name,
              countryCode: primaryCountryCode,
              countryName: null,
              regionGroup: null,
              availableDurations: dest.durations,
              isActive: true,
              lastSyncedAt: syncStartedAt,
              contentHash: hash,
              updatedAt: syncStartedAt,
            }

            const [upserted] = await this.db.db
              .insert(vacationDestinations)
              .values(record)
              .onConflictDoUpdate({
                target: [vacationDestinations.provider, vacationDestinations.providerIdentifier],
                set: {
                  name: record.name,
                  countryCode: record.countryCode,
                  availableDurations: record.availableDurations,
                  isActive: record.isActive,
                  lastSyncedAt: record.lastSyncedAt,
                  contentHash: record.contentHash,
                  updatedAt: record.updatedAt,
                },
              })
              .returning({ id: vacationDestinations.id })

            if (upserted) {
              destinationIdByProviderId.set(dest.id, upserted.id)
              gatewayDestinationIds.push(upserted.id)
              allSeenDestinationIds.add(upserted.id)
            }
          }
        }

        // ====================================================================
        // STEP 5: Fetch + upsert hotels for each destination
        // ====================================================================
        for (const dest of individualDestinations) {
          let hotels: VcoHotel[] = []
          try {
            hotels = await this.catalogClient.fetchHotels(gateway.airportCode, dest.id)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            this.logger.warn(`Failed to fetch hotels for gateway=${gateway.airportCode} dest=${dest.id}: ${msg}`)
            if (errors.length < 100) {
              errors.push({ message: msg, context: `gateway=${gateway.airportCode} dest=${dest.id}` })
            }
            continue
          }

          metrics.hotelsFound += hotels.length

          if (!dryRun && hotels.length > 0) {
            const destinationId = destinationIdByProviderId.get(dest.id) ?? null

            // Fetch existing hotels for this destination for change detection
            const existingHotels = await this.db.db
              .select({
                id: vacationHotels.id,
                providerIdentifier: vacationHotels.providerIdentifier,
                contentHash: vacationHotels.contentHash,
              })
              .from(vacationHotels)
              .where(
                and(
                  eq(vacationHotels.provider, 'softvoyage'),
                  destinationId
                    ? eq(vacationHotels.destinationId, destinationId)
                    : sql`1=0`
                )
              )

            const existingHotelMap = new Map(
              existingHotels.map((h) => [
                h.providerIdentifier,
                { id: h.id, contentHash: h.contentHash ?? '' },
              ])
            )

            const { toInsert, toUpdate, unchanged } = this.changeDetector.detectChanges(
              hotels,
              existingHotelMap,
              (hotel) => this.changeDetector.computeHash({ name: hotel.name, id: hotel.id }),
              (hotel) => hotel.id,
            )

            metrics.hotelsUnchanged += unchanged.length

            // Insert new hotels
            for (const hotel of toInsert) {
              const hash = this.changeDetector.computeHash({ name: hotel.name, id: hotel.id })
              await this.db.db
                .insert(vacationHotels)
                .values({
                  provider: 'softvoyage',
                  providerIdentifier: hotel.id,
                  destinationId,
                  name: hotel.name,
                  isActive: true,
                  lastSyncedAt: syncStartedAt,
                  contentHash: hash,
                  updatedAt: syncStartedAt,
                })
                .onConflictDoUpdate({
                  target: [vacationHotels.provider, vacationHotels.providerIdentifier],
                  set: {
                    name: hotel.name,
                    destinationId,
                    isActive: true,
                    lastSyncedAt: syncStartedAt,
                    contentHash: hash,
                    updatedAt: syncStartedAt,
                  },
                })
              metrics.hotelsInserted++
            }

            // Update changed hotels
            for (const { item: hotel, existingId } of toUpdate) {
              const hash = this.changeDetector.computeHash({ name: hotel.name, id: hotel.id })
              await this.db.db
                .update(vacationHotels)
                .set({
                  name: hotel.name,
                  destinationId,
                  isActive: true,
                  lastSyncedAt: syncStartedAt,
                  contentHash: hash,
                  updatedAt: syncStartedAt,
                })
                .where(eq(vacationHotels.id, existingId))
              metrics.hotelsUpdated++
            }

            // Mark unchanged hotels as synced (update lastSyncedAt)
            if (unchanged.length > 0) {
              for (const id of unchanged) {
                await this.db.db
                  .update(vacationHotels)
                  .set({ lastSyncedAt: syncStartedAt, isActive: true })
                  .where(eq(vacationHotels.id, id))
              }
            }
          }
        }

        // ====================================================================
        // STEP 6: Rebuild junction table for this gateway
        // ====================================================================
        if (!dryRun) {
          const gatewayId = gatewayIdByAirportCode.get(gateway.airportCode)
          if (gatewayId) {
            // Always delete existing links for this gateway (full replace per spec)
            await this.db.db
              .delete(vacationGatewayDestinations)
              .where(eq(vacationGatewayDestinations.gatewayId, gatewayId))

            // Re-insert current links (if any)
            if (gatewayDestinationIds.length > 0) {
              const junctionRows = gatewayDestinationIds.map((destinationId) => ({
                gatewayId,
                destinationId,
                lastSyncedAt: syncStartedAt,
              }))

              await this.db.db
                .insert(vacationGatewayDestinations)
                .values(junctionRows)
                .onConflictDoUpdate({
                  target: [vacationGatewayDestinations.gatewayId, vacationGatewayDestinations.destinationId],
                  set: { lastSyncedAt: syncStartedAt },
                })
            }
          }
        }
      }

      // ======================================================================
      // STEP 7: Soft-delete stale records
      // ======================================================================
      if (!dryRun) {
        // Soft-delete gateways not seen in this sync
        await this.db.db
          .update(vacationGateways)
          .set({ isActive: false, updatedAt: syncStartedAt })
          .where(
            and(
              eq(vacationGateways.provider, 'softvoyage'),
              eq(vacationGateways.isActive, true),
              lt(vacationGateways.lastSyncedAt, syncStartedAt)
            )
          )

        // Soft-delete destinations not seen in this sync
        await this.db.db
          .update(vacationDestinations)
          .set({ isActive: false, updatedAt: syncStartedAt })
          .where(
            and(
              eq(vacationDestinations.provider, 'softvoyage'),
              eq(vacationDestinations.isActive, true),
              lt(vacationDestinations.lastSyncedAt, syncStartedAt)
            )
          )

        // Count stale hotels before soft-deleting
        const staleHotelsCount = await this.db.db
          .select({ count: sql<number>`count(*)` })
          .from(vacationHotels)
          .where(
            and(
              eq(vacationHotels.provider, 'softvoyage'),
              eq(vacationHotels.isActive, true),
              lt(vacationHotels.lastSyncedAt, syncStartedAt)
            )
          )
        metrics.hotelsSoftDeleted = Number(staleHotelsCount[0]?.count ?? 0)

        // Soft-delete hotels not touched in this sync
        if (metrics.hotelsSoftDeleted > 0) {
          await this.db.db
            .update(vacationHotels)
            .set({ isActive: false, updatedAt: syncStartedAt })
            .where(
              and(
                eq(vacationHotels.provider, 'softvoyage'),
                eq(vacationHotels.isActive, true),
                lt(vacationHotels.lastSyncedAt, syncStartedAt)
              )
            )
        }

        this.logger.log(`Stale records soft-deleted: ${metrics.hotelsSoftDeleted} hotels`)
      }

      // ======================================================================
      // STEP 8: Update sync history to completed
      // ======================================================================
      await this.db.db
        .update(vacationSyncHistory)
        .set({
          status: 'completed',
          completedAt: new Date(),
          metrics,
          errors: errors.length > 0 ? errors : [],
        })
        .where(eq(vacationSyncHistory.id, syncHistoryId))

      this.logger.log(
        `Vacation catalog sync completed: gateways=${metrics.gatewaysFound}, ` +
        `destinations=${metrics.destinationsFound}, hotels found=${metrics.hotelsFound}, ` +
        `inserted=${metrics.hotelsInserted}, updated=${metrics.hotelsUpdated}, ` +
        `unchanged=${metrics.hotelsUnchanged}`
      )

      return metrics
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Vacation catalog sync failed: ${msg}`, error instanceof Error ? error.stack : undefined)

      // Update sync history to failed
      try {
        await this.db.db
          .update(vacationSyncHistory)
          .set({
            status: 'failed',
            completedAt: new Date(),
            metrics,
            errors: [...errors, { message: msg }].slice(0, 100),
          })
          .where(eq(vacationSyncHistory.id, syncHistoryId))
      } catch (historyErr) {
        this.logger.error('Failed to update sync history on error', historyErr)
      }

      throw error
    } finally {
      // Always release the advisory lock
      try {
        await this.db.db.execute(sql`SELECT pg_advisory_unlock(hashtext('vacation_catalog_sync'))`)
      } catch (unlockErr) {
        this.logger.error('Failed to release advisory lock', unlockErr)
      }
    }
  }

  // ============================================================================
  // SYNC STATUS
  // ============================================================================

  async getSyncStatus() {
    const [latest] = await this.db.db
      .select()
      .from(vacationSyncHistory)
      .orderBy(desc(vacationSyncHistory.startedAt))
      .limit(1)

    return latest ?? null
  }

  // ============================================================================
  // SCHEDULED CRON
  // ============================================================================

  @Cron('0 4 * * *', { timeZone: 'America/Toronto' })
  async scheduledSync(): Promise<void> {
    const enabled = this.configService.get('ENABLE_VACATION_CATALOG_SYNC')
    if (!enabled || enabled === 'false') {
      this.logger.debug('Vacation catalog sync cron skipped — ENABLE_VACATION_CATALOG_SYNC not set')
      return
    }

    this.logger.log('Vacation catalog sync cron triggered')

    try {
      await this.runSync()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Scheduled vacation catalog sync failed: ${msg}`, error instanceof Error ? error.stack : undefined)
      // Do not re-throw — cron must not crash the process
    }
  }
}
