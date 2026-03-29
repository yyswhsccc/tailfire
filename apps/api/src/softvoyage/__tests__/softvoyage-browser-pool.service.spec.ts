/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config'

// ---------------------------------------------------------------------------
// Mock puppeteer-extra (used by browser pool service with stealth plugin)
// ---------------------------------------------------------------------------

const mockNewPage = jest.fn()
const mockBrowserClose = jest.fn()
const mockLaunch = jest.fn()

jest.mock('puppeteer-extra', () => ({
  launch: mockLaunch,
  use: jest.fn(),
}))

jest.mock('puppeteer-extra-plugin-stealth', () => {
  return jest.fn(() => ({}))
})

// We import the service AFTER mock is declared
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SoftvoyageBrowserPoolService } = require('../softvoyage-browser-pool.service')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (key in overrides) return overrides[key]
      return fallback ?? undefined
    }),
  } as unknown as ConfigService
}

/** Create a fresh mock page object */
function makeMockPage() {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue(undefined),
    _id: Math.random(), // unique marker for identity checks
  }
}

/** Create a fresh mock browser that returns unique pages */
function makeMockBrowser() {
  const browser = {
    close: mockBrowserClose,
    newPage: mockNewPage,
  }
  return browser
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SoftvoyageBrowserPoolService', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Each launch() returns a fresh browser, each newPage() returns a fresh page
    mockBrowserClose.mockResolvedValue(undefined)
    mockNewPage.mockImplementation(() => Promise.resolve(makeMockPage()))
    mockLaunch.mockImplementation(() => Promise.resolve(makeMockBrowser()))
  })

  // ─── Instantiation ──────────────────────────────────────────────────────

  it('should be instantiable', () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())
    expect(service).toBeDefined()
  })

  // ─── Config reading ─────────────────────────────────────────────────────

  it('should read VACATION_BROWSER_POOL_SIZE from config (default 2)', () => {
    const config = makeConfigService()
    const service = new SoftvoyageBrowserPoolService(config)

    expect(config.get).toHaveBeenCalledWith(
      'VACATION_BROWSER_POOL_SIZE',
      '2',
    )
    expect(service).toBeDefined()
  })

  it('should use custom pool size from config', () => {
    const config = makeConfigService({ VACATION_BROWSER_POOL_SIZE: '5' })
    new SoftvoyageBrowserPoolService(config)
    expect(config.get).toHaveBeenCalledWith('VACATION_BROWSER_POOL_SIZE', '2')
  })

  it('should read ENABLE_VACATION_LIVE_PRICING from config', () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ ENABLE_VACATION_LIVE_PRICING: 'true' }),
    )
    expect(service.isEnabled()).toBe(true)
  })

  it('should default ENABLE_VACATION_LIVE_PRICING to false', () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())
    expect(service.isEnabled()).toBe(false)
  })

  // ─── Lazy init — no browser at startup ──────────────────────────────────

  it('should NOT launch any browser at construction time', () => {
    new SoftvoyageBrowserPoolService(makeConfigService())
    expect(mockLaunch).not.toHaveBeenCalled()
  })

  // ─── acquirePage / releasePage ──────────────────────────────────────────

  it('should launch a browser on first acquirePage()', async () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())

    const page = await service.acquirePage()

    expect(mockLaunch).toHaveBeenCalledTimes(1)
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: 'shell',
        args: expect.arrayContaining(['--no-sandbox', '--disable-gpu']),
      }),
    )
    expect(page).toBeDefined()

    await service.releasePage(page)
  })

  it('should reuse an idle page instead of launching a new browser', async () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())

    const page1 = await service.acquirePage()
    await service.releasePage(page1)

    const page2 = await service.acquirePage()

    // Still only 1 browser launched
    expect(mockLaunch).toHaveBeenCalledTimes(1)
    expect(page2).toBe(page1)

    await service.releasePage(page2)
  })

  it('should launch a second browser when first is in use and pool allows', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '2' }),
    )

    const page1 = await service.acquirePage()
    const page2 = await service.acquirePage()

    expect(mockLaunch).toHaveBeenCalledTimes(2)
    expect(page1).not.toBe(page2)

    await service.releasePage(page1)
    await service.releasePage(page2)
  })

  // ─── Wait queue (pool full) ─────────────────────────────────────────────

  it('should wait and resolve when a page is released (pool full)', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '1' }),
    )

    const page1 = await service.acquirePage()

    // Start waiting for a page (pool is full at size 1)
    const waitPromise = service.acquirePage()

    // Release the first page after a short delay
    setTimeout(() => service.releasePage(page1), 50)

    const page2 = await waitPromise
    expect(page2).toBe(page1) // same page recycled
    expect(mockLaunch).toHaveBeenCalledTimes(1) // no extra launch

    await service.releasePage(page2)
  })

  it('should reject pending waiters on module destroy (simulates timeout)', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '1' }),
    )

    // Acquire the only slot
    await service.acquirePage()

    // Start a waiter — pool is full, so it blocks
    const waitPromise = service.acquirePage()

    // Destroy the pool — this rejects all pending waiters
    await service.onModuleDestroy()

    await expect(waitPromise).rejects.toThrow('shutting down')
  })

  // ─── Recycling after MAX_USE_COUNT (50) uses ────────────────────────────

  it('should recycle browser after 50 uses', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '1' }),
    )

    const page = await service.acquirePage()

    // Simulate 50 acquire/release cycles (useCount 1-50)
    for (let i = 0; i < 50; i++) {
      await service.releasePage(page)
      const p = await service.acquirePage()
      expect(p).toBe(page)
    }

    // 51st release triggers recycle (useCount 51 > MAX_USE_COUNT of 50)
    await service.releasePage(page)

    expect(mockBrowserClose).toHaveBeenCalled()
    expect(mockLaunch).toHaveBeenCalledTimes(2)

    const newPage = await service.acquirePage()
    expect(newPage).not.toBe(page)

    await service.releasePage(newPage)
    await service.onModuleDestroy()
  })

  // ─── Chromium path config ───────────────────────────────────────────────

  it('should use PUPPETEER_EXECUTABLE_PATH from config', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ PUPPETEER_EXECUTABLE_PATH: '/opt/chrome/chrome' }),
    )

    await service.acquirePage()

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/opt/chrome/chrome',
      }),
    )

    await service.onModuleDestroy()
  })

  it('should fall back to /usr/bin/chromium when PUPPETEER_EXECUTABLE_PATH is not set', async () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())

    await service.acquirePage()

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/usr/bin/chromium',
      }),
    )

    await service.onModuleDestroy()
  })

  // ─── onModuleDestroy ────────────────────────────────────────────────────

  it('should close all browsers on module destroy', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '2' }),
    )

    await service.acquirePage()
    await service.acquirePage()

    expect(mockLaunch).toHaveBeenCalledTimes(2)

    await service.onModuleDestroy()

    // Each browser's close() should have been called
    expect(mockBrowserClose).toHaveBeenCalledTimes(2)
  })

  it('should reject pending waiters on module destroy', async () => {
    const service = new SoftvoyageBrowserPoolService(
      makeConfigService({ VACATION_BROWSER_POOL_SIZE: '1' }),
    )

    await service.acquirePage()

    const waitPromise = service.acquirePage()
    await service.onModuleDestroy()

    await expect(waitPromise).rejects.toThrow('shutting down')
  })

  // ─── releasePage with unknown page ──────────────────────────────────────

  it('should silently handle releasePage with an unknown page', async () => {
    const service = new SoftvoyageBrowserPoolService(makeConfigService())
    const unknownPage = { close: jest.fn() }

    // Should not throw
    await service.releasePage(unknownPage)
    await service.onModuleDestroy()
  })
})
