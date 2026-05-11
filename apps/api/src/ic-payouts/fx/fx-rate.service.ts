/**
 * FxRateService
 *
 * Bank of Canada FX rate fetcher and local snapshot cache for IC payouts.
 *
 * Responsibilities:
 *  - getRateOnDate(from, to, date) — synchronous lookup from fx_rate_snapshots with
 *    on-demand BoC fetch fallback. Identity pairs (USD→USD, CAD→CAD) return 1.0 instantly.
 *  - snapshotForDate(date) — fetches BoC observations and inserts both forward + inverse
 *    directions. Idempotent via INSERT ... ON CONFLICT DO NOTHING.
 *  - scheduledDailySnapshot() — @Cron weekday 16:30 ET, runs after BoC publishes ~16:00 ET.
 *
 * Walk-back behaviour:
 *   BoC does not publish rates on weekends or holidays. When getRateOnDate is called for a
 *   weekend/holiday date and no snapshot exists, we walk back up to 5 calendar days to find
 *   the most recent published rate. The rate is stored under the publication date it was
 *   found on, NOT the requested date. The caller receives the nearest available rate.
 *
 * Extensibility:
 *   snapshotForDate accepts an optional `pairs` parameter. Add entries for GBP/EUR etc:
 *     { from: 'GBP', to: 'CAD', bocSeries: 'FXGBPCAD' }
 *
 * Source: https://www.bankofcanada.ca/valet/observations/{series}/json
 */

import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Cron } from '@nestjs/schedule'
import { firstValueFrom } from 'rxjs'
import { and, eq, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'

const { fxRateSnapshots } = schema

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurrencyPair {
  from: string
  to: string
  /** BoC Valet series name, e.g. 'FXUSDCAD' */
  bocSeries: string
}

const DEFAULT_PAIRS: CurrencyPair[] = [
  { from: 'USD', to: 'CAD', bocSeries: 'FXUSDCAD' },
]

interface BocObservationEntry {
  d: string
  [seriesKey: string]: { v: string } | string
}

interface BocValetResponse {
  observations: BocObservationEntry[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name)
  private readonly BOC_BASE = 'https://www.bankofcanada.ca/valet/observations'

  constructor(
    private readonly db: DatabaseService,
    private readonly http: HttpService,
  ) {}

  /**
   * Returns the exchange rate for from→to on a specific date (ISO 'YYYY-MM-DD').
   *
   * Identity pairs (USD→USD, CAD→CAD) return 1.0 without DB access.
   *
   * If no snapshot exists for the date, walks back up to 5 days to find the
   * most recent BoC publication (handles weekends and holidays). Fetches,
   * stores both directions, and returns the rate.
   *
   * @throws Error if no rate can be found within the 5-day walk-back window.
   */
  async getRateOnDate(from: string, to: string, date: string): Promise<number> {
    if (from === to) return 1.0

    // 1. Check existing snapshot for the exact date
    const existing = await this.lookup(from, to, date)
    if (existing != null) return existing

    // 2. Walk back to find a publication date and store it
    const rate = await this.fetchAndStoreNearestPublication(from, to, date)
    if (rate == null) {
      throw new Error(`Could not resolve FX rate ${from}→${to} on or before ${date} (walked back 5 days)`)
    }
    return rate
  }

  /**
   * Fetches BoC observations for the given date and stores all configured pairs.
   * Inserts both forward and inverse directions.
   * Idempotent: INSERT ... ON CONFLICT DO NOTHING — safe to re-run.
   *
   * @param date ISO date string 'YYYY-MM-DD'
   * @param pairs Currency pairs to snapshot. Defaults to USD↔CAD only.
   */
  async snapshotForDate(date: string, pairs: CurrencyPair[] = DEFAULT_PAIRS): Promise<void> {
    for (const pair of pairs) {
      const value = await this.fetchBocObservation(pair.bocSeries, date)
      if (value == null) {
        this.logger.warn(`[ic-payouts/fx] No BoC observation for ${pair.bocSeries} on ${date} (weekend/holiday?)`)
        continue
      }
      await this.storePair(pair.from, pair.to, date, value)
      this.logger.debug(`[ic-payouts/fx] Stored ${pair.from}→${pair.to} = ${value} on ${date}`)
    }
  }

  /**
   * Scheduled daily snapshot. Runs weekdays at 16:30 ET.
   * BoC publishes rates at approximately 16:00 ET.
   * Excluded from weekends by the cron pattern '1-5' (Mon–Fri).
   */
  @Cron('30 16 * * 1-5', {
    name: 'ic-payouts-fx-daily-snapshot',
    timeZone: 'America/Toronto',
  })
  async scheduledDailySnapshot(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)
    this.logger.log(`[ic-payouts/fx] Running daily FX snapshot for ${today}`)
    try {
      await this.snapshotForDate(today)
      this.logger.log(`[ic-payouts/fx] FX snapshot complete for ${today}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[ic-payouts/fx] FX snapshot failed for ${today}: ${msg}`)
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async lookup(from: string, to: string, date: string): Promise<number | null> {
    const [row] = await this.db.client
      .select()
      .from(fxRateSnapshots)
      .where(and(
        eq(fxRateSnapshots.rateDate, date),
        eq(fxRateSnapshots.fromCurrency, from),
        eq(fxRateSnapshots.toCurrency, to),
      ))
      .limit(1)
    return row ? Number(row.rate) : null
  }

  /**
   * Walks back from the requested date looking for a BoC publication.
   * Stores the found rate under its publication date and returns the stored rate.
   * Handles inverse lookups: if caller asks CAD→USD but we only have FXUSDCAD
   * configured, we fetch USD→CAD and return the stored CAD→USD inverse.
   */
  private async fetchAndStoreNearestPublication(
    from: string,
    to: string,
    requestedDate: string,
  ): Promise<number | null> {
    // Find the configured series that covers this currency pair (forward or inverse)
    const forwardPair = DEFAULT_PAIRS.find(p => p.from === from && p.to === to)
    const inversePair = DEFAULT_PAIRS.find(p => p.from === to && p.to === from)

    const pair = forwardPair ?? inversePair
    if (!pair) {
      throw new Error(`No BoC series configured for ${from}↔${to}`)
    }

    // Walk back up to 5 days to find a publication
    for (let i = 0; i < 5; i++) {
      const tryDate = subtractDays(requestedDate, i)
      const value = await this.fetchBocObservation(pair.bocSeries, tryDate)
      if (value != null) {
        await this.storePair(pair.from, pair.to, tryDate, value)
        // The lookup will now hit the stored snapshot (handles both forward + inverse)
        return this.lookup(from, to, tryDate)
      }
    }
    return null
  }

  /**
   * Calls BoC Valet API for a single series + date.
   * Returns null when observations are empty (weekend/holiday) or on HTTP error.
   */
  private async fetchBocObservation(series: string, date: string): Promise<number | null> {
    const url = `${this.BOC_BASE}/${series}/json?start_date=${date}&end_date=${date}`
    try {
      const response = await firstValueFrom(this.http.get<BocValetResponse>(url))
      const observations = response.data?.observations
      if (!observations || observations.length === 0) return null
      const obs = observations[0]
      if (!obs) return null
      const seriesData = obs[series]
      if (typeof seriesData === 'object' && seriesData !== null && 'v' in seriesData) {
        const val = Number((seriesData as { v: string }).v)
        return isNaN(val) ? null : val
      }
      return null
    } catch (err) {
      this.logger.warn(
        `[ic-payouts/fx] BoC fetch failed for ${series} on ${date}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return null
    }
  }

  /**
   * Inserts both forward and inverse rates for a pair.
   * Uses INSERT ... ON CONFLICT DO NOTHING so re-runs are safe.
   * Stores CAD→USD as 1/rate (USD→CAD), enabling bidirectional lookups.
   */
  private async storePair(from: string, to: string, date: string, rate: number): Promise<void> {
    const inverse = 1 / rate
    await this.db.client.execute(sql`
      INSERT INTO fx_rate_snapshots (rate_date, from_currency, to_currency, rate, source, fetched_at)
      VALUES
        (${date}::date, ${from}, ${to}, ${rate.toFixed(8)}::numeric, 'bank_of_canada', now()),
        (${date}::date, ${to}, ${from}, ${inverse.toFixed(8)}::numeric, 'bank_of_canada', now())
      ON CONFLICT (rate_date, from_currency, to_currency) DO NOTHING
    `)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function subtractDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
