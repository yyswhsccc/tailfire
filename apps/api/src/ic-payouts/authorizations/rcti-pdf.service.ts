/**
 * RCTI PDF Service
 *
 * Renders an RCTI agreement text + embedded signature PNG to a PDF buffer
 * using the shared PuppeteerPdfService. Matches the launch flags and lifecycle
 * of existing PDF rendering in the codebase (see financials/trip-order.service.ts).
 *
 * NOTE: Do NOT test actual Puppeteer rendering in unit tests — mock this service
 * and have it return Buffer.from('fake-pdf'). Visual verification belongs in
 * manual smoke testing.
 */

import { Injectable } from '@nestjs/common'
import { PuppeteerPdfService } from '../../document-render/puppeteer-pdf.service'

@Injectable()
export class RctiPdfService {
  constructor(private readonly puppeteerPdf: PuppeteerPdfService) {}

  async render(input: { text: string; signaturePngBytes: Buffer }): Promise<Buffer> {
    const html = `<!DOCTYPE html><html><head><style>
      body { font-family: 'Helvetica', sans-serif; padding: 40px; line-height: 1.6; }
      pre { white-space: pre-wrap; font-family: inherit; }
      .signature { margin-top: 40px; border-top: 1px solid #999; padding-top: 8px; }
      .signature img { max-height: 80px; }
    </style></head><body>
      <pre>${this.escapeHtml(input.text)}</pre>
      <div class="signature">
        <p>Electronic signature:</p>
        <img src="data:image/png;base64,${input.signaturePngBytes.toString('base64')}" />
      </div>
    </body></html>`

    return this.puppeteerPdf.renderHtmlToPdf(html)
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => (({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    } as Record<string, string>)[c] ?? c))
  }
}
