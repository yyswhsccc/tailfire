/**
 * IcInvoicePdfService
 *
 * Renders an RCTI (Recipient-Created Tax Invoice) to a PDF buffer using
 * the shared PuppeteerPdfService. Matches the pattern established by
 * RctiPdfService in ic-payouts/authorizations/rcti-pdf.service.ts.
 *
 * NOTE: Do NOT test actual Puppeteer rendering in unit tests — mock this
 * service and have it return Buffer.from('fake-pdf'). Visual verification
 * belongs in manual smoke testing.
 *
 * The interface intentionally keeps all user-visible strings (IC name,
 * address, trip refs, descriptions) going through the template's esc()
 * helper — XSS prevention in the rendered PDF is the template's concern.
 */

import { Injectable } from '@nestjs/common'
import { PuppeteerPdfService } from '../../document-render/puppeteer-pdf.service'
import { renderInvoiceHtml, type RenderInput } from './templates/invoice-template.html'
import type { schema } from '@tailfire/database'

type IcInvoice = typeof schema.icInvoices.$inferSelect
type IcInvoiceLine = typeof schema.icInvoiceLines.$inferSelect

export interface IcInvoicePdfRenderInput {
  invoice: IcInvoice
  lines: IcInvoiceLine[]
  // Agency identity block (left party on the invoice)
  agencyLegalName: string
  agencyAddressLines: string[]  // ['123 Main St', 'Toronto, ON  M5H 1A1']
  agencyBn15: string            // BN15 masked for display: '****1234'
  // IC identity (right party on the invoice — snapshotted from ic_tax_profiles)
  icLegalName: string
  icAddress: { street: string; city: string; province: string; postalCode: string }
  icGstHstNumber: string | null
  icSinOrBnMask: string | null
  // Agreement metadata
  rctiAgreementVersion: string
}

@Injectable()
export class IcInvoicePdfService {
  constructor(private readonly puppeteer: PuppeteerPdfService) {}

  async render(input: IcInvoicePdfRenderInput): Promise<Buffer> {
    // The invoice and line types satisfy the template's structural interface
    // (InvoiceType / InvoiceLineType) because IcInvoice contains all fields
    // referenced in renderInvoiceHtml.
    const renderInput: RenderInput = {
      invoice: input.invoice,
      lines: input.lines,
      agencyLegalName: input.agencyLegalName,
      agencyAddressLines: input.agencyAddressLines,
      agencyBn15: input.agencyBn15,
      icLegalName: input.icLegalName,
      icAddress: input.icAddress,
      icGstHstNumber: input.icGstHstNumber,
      icSinOrBnMask: input.icSinOrBnMask,
      rctiAgreementVersion: input.rctiAgreementVersion,
    }
    const html = renderInvoiceHtml(renderInput)
    return this.puppeteer.renderHtmlToPdf(html)
  }
}
