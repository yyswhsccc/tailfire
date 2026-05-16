/**
 * CommissionDriftScheduler (PR-3)
 *
 * Periodic trigger for CommissionDriftService.runSnapshot(). Uses
 * setInterval (NOT BullMQ) per the Upstash limitation documented in
 * CLAUDE.md: "Upstash BullMQ limitations — Delayed/repeat jobs don't
 * fire on Upstash. Use setInterval for recurring tasks."
 *
 * Cadence: 6 hours by default.
 * Startup behavior: runs once after a 30s warm-up delay so we don't
 *                   block app boot, then on each interval.
 * Single-flight: in-memory boolean guard. Overlapping ticks log + skip.
 * Escape hatch: DISABLE_COMMISSION_DRIFT_CHECK=true disables both
 *               startup run AND interval.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CommissionDriftService } from './commission-drift.service'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 30 * 1000

@Injectable()
export class CommissionDriftScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommissionDriftScheduler.name)
  private interval: NodeJS.Timeout | null = null
  private startupTimer: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(
    private readonly driftService: CommissionDriftService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.isDisabled()) {
      this.logger.log('Commission drift check is DISABLED (DISABLE_COMMISSION_DRIFT_CHECK=true)')
      return
    }
    // First snapshot 30s after boot so we don't slow startup, then every 6h.
    this.startupTimer = setTimeout(() => {
      void this.tick('startup')
      this.interval = setInterval(() => {
        void this.tick('interval')
      }, SIX_HOURS_MS)
    }, STARTUP_DELAY_MS)

    this.logger.log(
      `Commission drift scheduler armed: first run in ${STARTUP_DELAY_MS}ms, ` +
        `then every ${SIX_HOURS_MS / 1000 / 60}min`,
    )
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    if (this.interval) clearInterval(this.interval)
  }

  /**
   * Single tick of the scheduler. Public so an integration test can
   * invoke it directly without waiting on setInterval. The single-flight
   * guard means a stuck previous tick won't pile up overlapping work.
   */
  async tick(trigger: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        `Commission drift tick (${trigger}) skipped — previous run still in progress`,
      )
      return
    }
    this.isRunning = true
    const start = Date.now()
    try {
      const snapshots = await this.driftService.runSnapshot()
      const elapsed = Date.now() - start
      this.logger.log(
        `Commission drift tick (${trigger}) completed in ${elapsed}ms: ${snapshots.length} snapshot rows written`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Commission drift tick (${trigger}) failed: ${msg}`)
    } finally {
      this.isRunning = false
    }
  }

  private isDisabled(): boolean {
    return this.configService.get<string>('DISABLE_COMMISSION_DRIFT_CHECK') === 'true'
  }
}
