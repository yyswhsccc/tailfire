/**
 * IcInvoicePdfService (stub)
 *
 * Task 24 stub — returns a minimal valid-looking PDF buffer so that
 * IcInvoiceService can compile and pass tests without a real Puppeteer renderer.
 *
 * Task 25 will replace this body with real Puppeteer rendering. The interface
 * is intentionally stable: Task 25 only needs to fill in the render() body.
 */

import { Injectable } from '@nestjs/common'
import type { schema } from '@tailfire/database'

type IcInvoice = typeof schema.icInvoices.$inferSelect
type IcInvoiceLine = typeof schema.icInvoiceLines.$inferSelect

export interface IcInvoicePdfRenderInput {
  invoice: IcInvoice
  lines: IcInvoiceLine[]
  icLegalName: string
  icAddress: Record<string, unknown>
  icGstHstNumber: string | null
  icSinOrBnMask: string | null
}

@Injectable()
export class IcInvoicePdfService {
  /**
   * Render an RCTI invoice to PDF bytes.
   *
   * Task 25 will implement Puppeteer rendering.
   * This stub returns a minimal placeholder PDF buffer so IcInvoiceService
   * can function (with the PDF-failure-is-non-blocking path) until Task 25
   * drops in the real implementation.
   */
  async render(_input: IcInvoicePdfRenderInput): Promise<Buffer> {
    return Buffer.from('%PDF-1.4\n% Stub PDF - Task 25 will implement Puppeteer rendering\n')
  }
}
