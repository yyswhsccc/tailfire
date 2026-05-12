/**
 * Trip Proposal PDF Service
 *
 * Renders the live admin proposal preview page to PDF via Puppeteer.
 *
 * Flow:
 *   1. Caller (controller) verifies write access on the trip.
 *   2. This service mints a short-lived HMAC token tied to the trip.
 *   3. Puppeteer navigates to `${ADMIN_URL}/trips/:id/preview?pdfToken=<token>`.
 *   4. The admin page fetches proposal data via the @Public() pdf-token endpoint,
 *      hides chrome, then sets `data-pdf-ready="true"` on <body>.
 *   5. Puppeteer waits for the marker, prints to PDF, returns the buffer.
 */

import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PuppeteerPdfService } from '../document-render/puppeteer-pdf.service'

interface PdfTokenPayload {
  tripId: string
  agencyId: string
  exp: number
}

@Injectable()
export class TripProposalPdfService {
  private readonly logger = new Logger(TripProposalPdfService.name)
  private readonly tokenTtlMs = 5 * 60 * 1000 // 5 minutes

  constructor(
    private readonly puppeteerPdf: PuppeteerPdfService,
    private readonly configService: ConfigService,
  ) {}

  signToken(tripId: string, agencyId: string): string {
    const payload: PdfTokenPayload = {
      tripId,
      agencyId,
      exp: Date.now() + this.tokenTtlMs,
    }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = this.hmac(body)
    return `${body}.${sig}`
  }

  verifyToken(token: string, expectedTripId: string): PdfTokenPayload {
    const parts = token.split('.')
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid PDF token format')
    }
    const [body, sig] = parts as [string, string]
    const expected = this.hmac(body)
    const sigBuf = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid PDF token signature')
    }
    let payload: PdfTokenPayload
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
      throw new UnauthorizedException('Invalid PDF token payload')
    }
    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('PDF token expired')
    }
    if (payload.tripId !== expectedTripId) {
      throw new UnauthorizedException('PDF token does not match trip')
    }
    return payload
  }

  async renderProposalPdf(tripId: string, agencyId: string): Promise<Buffer> {
    const adminUrl = this.configService.get<string>('ADMIN_URL') || 'http://localhost:3100'
    const token = this.signToken(tripId, agencyId)
    const url = `${adminUrl}/trips/${tripId}/preview?pdfToken=${encodeURIComponent(token)}`

    this.logger.log(`Rendering proposal PDF: ${adminUrl}/trips/${tripId}/preview`)

    try {
      return await this.puppeteerPdf.renderUrlToPdf(url, {
        viewport: { width: 1024, height: 1400, deviceScaleFactor: 2 },
        navigationTimeoutMs: 30000,
        setup: async (page) => {
          await page.waitForSelector('body[data-pdf-ready="true"]', { timeout: 20000 })
        },
        pdfOptions: {
          format: 'letter',
          printBackground: true,
          margin: {
            top: '0.4in',
            right: '0.4in',
            bottom: '0.4in',
            left: '0.4in',
          },
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Proposal PDF render failed for trip ${tripId}: ${message}`)
      throw new ServiceUnavailableException('Failed to render proposal PDF')
    }
  }

  private hmac(input: string): string {
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET')
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is required for PDF token signing')
    }
    return crypto.createHmac('sha256', secret).update(input).digest('base64url')
  }
}
