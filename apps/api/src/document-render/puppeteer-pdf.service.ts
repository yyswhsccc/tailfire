/**
 * Puppeteer PDF Service
 *
 * Standalone injectable service for synchronous HTML-to-PDF rendering.
 * Manages a lazy-initialized Puppeteer browser instance.
 *
 * Used by TripOrderService (direct rendering) and DocumentRenderProcessor (queue-based).
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import * as puppeteer from 'puppeteer-core'

@Injectable()
export class PuppeteerPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerPdfService.name)
  private browser: puppeteer.Browser | null = null

  /**
   * Render an HTML string (with optional CSS) to a PDF buffer.
   * If the HTML already contains a full document structure, it is used as-is.
   * Otherwise it is wrapped in a minimal HTML document.
   */
  async renderHtmlToPdf(html: string, css?: string): Promise<Buffer> {
    const fullHtml = this.wrapHtml(html, css)

    const browser = await this.getBrowser()
    const page = await browser.newPage()

    try {
      await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 15000 })

      const pdfBuffer = await page.pdf({
        format: 'letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
      })

      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private wrapHtml(html: string, css?: string): string {
    // If the template already starts with <!DOCTYPE or <html, treat it as a full document
    const trimmed = html.trimStart().toLowerCase()
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      // Inject CSS into existing <head> if provided
      if (css) {
        return html.replace(
          /(<head[^>]*>)/i,
          `$1<style>${css}</style>`,
        )
      }
      return html
    }

    // Wrap bare HTML fragment
    return css
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`
      : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
  }

  // ---------------------------------------------------------------------------
  // Browser lifecycle
  // ---------------------------------------------------------------------------

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser
    }

    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'

    this.logger.log(`Launching Puppeteer browser from ${executablePath}`)

    this.browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })

    return this.browser
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing Puppeteer browser')
      await this.browser.close()
      this.browser = null
    }
  }
}
