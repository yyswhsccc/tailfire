/**
 * Softvoyage Browser Pool Service
 *
 * Manages a pool of reusable headless browser instances for navigating
 * Softvoyage VCO (public widget, no auth needed). Uses puppeteer-core
 * (same Chromium binary as PDF renderer — proven to work on Railway).
 * Browsers are lazy-launched on first acquirePage() call.
 *
 * Used by the VACATION_SEARCH BullMQ processor to:
 * 1. Acquire a page
 * 2. Navigate to VCO search form, fill, submit
 * 3. Wait for results, get HTML
 * 4. Release page back to pool
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Browser, Page } from 'puppeteer-core'

// Try to use puppeteer-extra with stealth for DataDome bypass.
// Falls back to plain puppeteer-core if puppeteer-extra is unavailable.
let puppeteer: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  puppeteer = require('puppeteer-extra')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const StealthPlugin = require('puppeteer-extra-plugin-stealth')
  puppeteer.use(StealthPlugin())
  console.log('[SoftvoyageBrowserPoolService] puppeteer-extra + stealth loaded')
} catch {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  puppeteer = require('puppeteer-core')
  console.log('[SoftvoyageBrowserPoolService] WARN: puppeteer-extra unavailable, using puppeteer-core (no stealth)')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoolEntry {
  browser: Browser
  page: Page
  inUse: boolean
  useCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_POOL_SIZE = 2
const MAX_USE_COUNT = 50
const ACQUIRE_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SoftvoyageBrowserPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(SoftvoyageBrowserPoolService.name)
  private readonly pool: PoolEntry[] = []
  private readonly maxPoolSize: number
  private readonly enabled: boolean

  /** Queue of waiters blocked on acquirePage() when pool is full */
  private readonly waitQueue: Array<{
    resolve: (entry: PoolEntry) => void
    reject: (err: Error) => void
  }> = []

  constructor(private readonly configService: ConfigService) {
    this.maxPoolSize = parseInt(
      this.configService.get<string>('VACATION_BROWSER_POOL_SIZE', `${DEFAULT_POOL_SIZE}`),
      10,
    )
    if (isNaN(this.maxPoolSize) || this.maxPoolSize < 1) {
      this.maxPoolSize = DEFAULT_POOL_SIZE
    }

    this.enabled =
      this.configService.get<string>('ENABLE_VACATION_LIVE_PRICING', 'false') === 'true'

    this.logger.log(
      `Initialized — poolSize=${this.maxPoolSize}, livePricing=${this.enabled}`,
    )
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Acquire a Playwright Page from the pool.
   *
   * - If a free page exists, return it immediately.
   * - If the pool has capacity, launch a new browser and return its page.
   * - Otherwise, wait up to 30 s for a page to be released.
   */
  async acquirePage(): Promise<Page> {
    // 1. Try to find an idle entry
    const idle = this.pool.find((e) => !e.inUse)
    if (idle) {
      idle.inUse = true
      this.logger.debug(
        `Acquired existing page (pool=${this.pool.length}, inUse=${this.inUseCount()})`,
      )
      return idle.page
    }

    // 2. Pool has room — launch a new browser
    if (this.pool.length < this.maxPoolSize) {
      const entry = await this.launchEntry()
      entry.inUse = true
      this.logger.debug(
        `Acquired new page (pool=${this.pool.length}, inUse=${this.inUseCount()})`,
      )
      return entry.page
    }

    // 3. Pool full — wait with bounded timeout
    this.logger.debug(
      `Pool full (${this.pool.length}/${this.maxPoolSize}), waiting for release...`,
    )
    return this.waitForAvailable()
  }

  /**
   * Release a page back to the pool.
   * Increments the use count and recycles the browser if it exceeds the max.
   */
  async releasePage(page: Page): Promise<void> {
    const entry = this.pool.find((e) => e.page === page)
    if (!entry) {
      this.logger.warn('releasePage called with unknown page — ignoring')
      return
    }

    entry.useCount++

    // Recycle if the browser has been reused too many times
    if (entry.useCount > MAX_USE_COUNT) {
      this.logger.log(
        `Recycling browser after ${entry.useCount} uses`,
      )
      await this.recycleEntry(entry)
    }

    entry.inUse = false

    // Notify the oldest waiter, if any
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!
      entry.inUse = true
      waiter.resolve(entry)
    }

    this.logger.debug(
      `Released page (pool=${this.pool.length}, inUse=${this.inUseCount()})`,
    )
  }

  /**
   * Whether live pricing is enabled (ENABLE_VACATION_LIVE_PRICING=true).
   */
  isEnabled(): boolean {
    return this.enabled
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async onModuleDestroy(): Promise<void> {
    this.logger.log(`Shutting down — closing ${this.pool.length} browser(s)`)

    // Reject any pending waiters
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Browser pool is shutting down'))
    }
    this.waitQueue.length = 0

    // Close all browsers in parallel
    await Promise.allSettled(
      this.pool.map(async (entry) => {
        try {
          await entry.browser.close()
        } catch {
          // Browser may already be disconnected
        }
      }),
    )

    this.pool.length = 0
    this.logger.log('All browsers closed')
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async launchEntry(): Promise<PoolEntry> {
    const executablePath =
      this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || '/usr/bin/chromium'

    this.logger.log(
      `Launching Chromium from ${executablePath} (pool slot ${this.pool.length + 1}/${this.maxPoolSize})`,
    )

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ]

    // Add residential proxy if configured
    const proxyUrl = this.configService.get<string>('RESIDENTIAL_PROXY_URL')
    if (proxyUrl) {
      try {
        const parsed = new URL(proxyUrl)
        launchArgs.push(`--proxy-server=${parsed.protocol}//${parsed.hostname}:${parsed.port}`)
      } catch { /* ignore invalid proxy URL */ }
    }

    const browser = await puppeteer.launch({
      executablePath,
      headless: 'shell',
      args: launchArgs,
    })

    const page = await browser.newPage()

    const entry: PoolEntry = {
      browser,
      page,
      inUse: false,
      useCount: 0,
    }

    this.pool.push(entry)
    return entry
  }

  /**
   * Close old browser, launch a fresh one in the same pool slot.
   */
  private async recycleEntry(entry: PoolEntry): Promise<void> {
    try {
      await entry.browser.close()
    } catch {
      // Browser may already be disconnected
    }

    const executablePath =
      this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || '/usr/bin/chromium'

    this.logger.log(`Launching replacement Chromium from ${executablePath}`)

    const recycleArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ]
    const proxyUrl = this.configService.get<string>('RESIDENTIAL_PROXY_URL')
    if (proxyUrl) {
      try {
        const parsed = new URL(proxyUrl)
        recycleArgs.push(`--proxy-server=${parsed.protocol}//${parsed.hostname}:${parsed.port}`)
      } catch { /* ignore */ }
    }

    const browser = await puppeteer.launch({
      executablePath,
      headless: 'shell',
      args: recycleArgs,
    })

    const page = await browser.newPage()

    entry.browser = browser
    entry.page = page
    entry.useCount = 0
  }

  /**
   * Wait for an available pool entry with a bounded timeout (30 s).
   * Uses a Promise-based queue — no external deps needed.
   */
  private async waitForAvailable(): Promise<Page> {
    return new Promise<Page>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter from the queue
        const idx = this.waitQueue.findIndex((w) => w.resolve === entryResolve)
        if (idx !== -1) this.waitQueue.splice(idx, 1)
        reject(new Error(`Timed out waiting for browser page (${ACQUIRE_TIMEOUT_MS}ms)`))
      }, ACQUIRE_TIMEOUT_MS)

      const entryResolve = (entry: PoolEntry) => {
        clearTimeout(timer)
        resolve(entry.page)
      }

      const entryReject = (err: Error) => {
        clearTimeout(timer)
        reject(err)
      }

      this.waitQueue.push({ resolve: entryResolve, reject: entryReject })
    })
  }

  private inUseCount(): number {
    return this.pool.filter((e) => e.inUse).length
  }
}
