/**
 * IC Invoice HTML Template
 *
 * Renders an RCTI (Recipient-Created Tax Invoice) as a full HTML document
 * suitable for Puppeteer PDF rendering. All user-supplied strings are
 * HTML-escaped via the esc() helper to prevent XSS in the rendered PDF.
 *
 * Called by IcInvoicePdfService after the invoice transaction commits.
 *
 * NOTE: This module defines its own minimal interface types to avoid a
 * circular dependency between the template and the schema/service layers.
 * The real IcInvoice and IcInvoiceLine types are structurally compatible.
 */

// Minimal invoice fields required for rendering (structural subset of IcInvoice)
interface InvoiceType {
  invoiceNumber: string
  invoiceDate: string
  currency: string
  reportableBaseCents: number
  taxCents: number
  totalCents: number
  taxType: string
  taxRateBp: number
  placeOfSupplyJurisdiction: string
  placeOfSupplyRule: string
}

// Minimal line fields required for rendering (structural subset of IcInvoiceLine)
interface InvoiceLineType {
  lineType: string
  amountCents: number
  description?: string | null
  tripRef?: string | null
}

export interface RenderInput {
  invoice: InvoiceType
  lines: InvoiceLineType[]
  agencyLegalName: string
  agencyAddressLines: string[]
  agencyBn15: string
  icLegalName: string
  icAddress: { street: string; city: string; province: string; postalCode: string }
  icGstHstNumber: string | null
  icSinOrBnMask: string | null
  rctiAgreementVersion: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, c => (({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  } as Record<string, string>)[c]!))
}

function formatCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2)
  return `${currency} ${amount}`
}

// ─── Main render function ─────────────────────────────────────────────────────

export function renderInvoiceHtml(input: RenderInput): string {
  const i = input.invoice
  const formatAmount = (cents: number) => formatCents(cents, i.currency)
  const ratePct = (i.taxRateBp / 100).toFixed(2)

  const lineRows = input.lines.map(line => `
    <tr>
      <td>${esc(line.tripRef ?? '')}</td>
      <td>${esc(line.description ?? '')}<span class="line-type">${line.lineType === 'adjustment' ? ' (adjustment)' : ''}</span></td>
      <td class="amount ${line.amountCents < 0 ? 'negative' : ''}">${formatAmount(line.amountCents)}</td>
    </tr>
  `).join('')

  const taxRow = i.taxCents > 0
    ? `<tr>
        <td class="label">${esc(i.taxType)} (${ratePct}%):</td>
        <td class="value">${formatAmount(i.taxCents)}</td>
      </tr>`
    : `<tr>
        <td class="label">${esc(i.taxType)}:</td>
        <td class="value">${formatAmount(0)}</td>
      </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(i.invoiceNumber)}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24pt; }
  .header h1 { font-size: 22pt; margin: 0; color: #111; }
  .header .meta { text-align: right; font-size: 9pt; color: #555; }
  .header .meta strong { display: block; color: #111; font-size: 11pt; }
  .badge { display: inline-block; padding: 2pt 6pt; background: #f0f0f0; border-radius: 3pt; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5pt; }

  .parties { display: flex; gap: 24pt; margin-bottom: 18pt; }
  .parties .party { flex: 1; }
  .parties h3 { font-size: 9pt; text-transform: uppercase; color: #666; margin: 0 0 6pt; letter-spacing: 0.5pt; }
  .parties .name { font-weight: bold; margin-bottom: 2pt; }
  .parties .field { font-size: 9pt; color: #444; }

  table.lines { width: 100%; border-collapse: collapse; margin: 18pt 0; }
  table.lines th { text-align: left; font-size: 9pt; text-transform: uppercase; color: #555; border-bottom: 1pt solid #999; padding: 6pt; }
  table.lines td { padding: 6pt; border-bottom: 1pt solid #eee; vertical-align: top; }
  table.lines td.amount { text-align: right; font-variant-numeric: tabular-nums; }
  table.lines td.amount.negative { color: #b00020; }
  .line-type { color: #888; font-size: 9pt; }

  .totals { display: flex; justify-content: flex-end; margin-top: 12pt; }
  .totals table { font-variant-numeric: tabular-nums; }
  .totals td { padding: 3pt 12pt; }
  .totals td.label { text-align: right; color: #555; }
  .totals td.value { text-align: right; min-width: 100pt; font-weight: bold; }
  .totals tr.total td { border-top: 1pt solid #999; padding-top: 6pt; font-size: 13pt; }

  .footer { margin-top: 36pt; font-size: 8pt; color: #777; border-top: 1pt solid #eee; padding-top: 12pt; }
  .footer .rcti-note { margin-bottom: 6pt; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Invoice</h1>
    <div class="badge">Recipient-Created Tax Invoice</div>
  </div>
  <div class="meta">
    <strong>${esc(i.invoiceNumber)}</strong>
    <div>Invoice date: ${esc(i.invoiceDate)}</div>
    <div>Currency: ${esc(i.currency)}</div>
  </div>
</div>

<div class="parties">
  <div class="party">
    <h3>Issued by (Recipient)</h3>
    <div class="name">${esc(input.agencyLegalName)}</div>
    ${input.agencyAddressLines.map(l => `<div class="field">${esc(l)}</div>`).join('')}
    <div class="field">BN: ${esc(input.agencyBn15)}</div>
  </div>
  <div class="party">
    <h3>For (Supplier)</h3>
    <div class="name">${esc(input.icLegalName)}</div>
    <div class="field">${esc(input.icAddress.street)}</div>
    <div class="field">${esc(input.icAddress.city)}, ${esc(input.icAddress.province)} ${esc(input.icAddress.postalCode)}</div>
    ${input.icGstHstNumber ? `<div class="field">GST/HST #: ${esc(input.icGstHstNumber)}</div>` : ''}
    ${input.icSinOrBnMask ? `<div class="field">${esc(input.icSinOrBnMask)}</div>` : ''}
  </div>
</div>

<table class="lines">
  <thead>
    <tr>
      <th style="width: 25%">Trip</th>
      <th>Description</th>
      <th style="width: 20%; text-align: right;">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr>
      <td class="label">Subtotal (pre-tax):</td>
      <td class="value">${formatAmount(i.reportableBaseCents)}</td>
    </tr>
    ${taxRow}
    <tr class="total">
      <td class="label">Total:</td>
      <td class="value">${formatAmount(i.totalCents)}</td>
    </tr>
  </table>
</div>

<div class="footer">
  <div class="rcti-note">
    This invoice was issued by ${esc(input.agencyLegalName)} on behalf of ${esc(input.icLegalName)}
    under the Recipient-Created Tax Invoice agreement (${esc(input.rctiAgreementVersion)}) dated and
    e-signed by the supplier. Place of supply: ${esc(i.placeOfSupplyJurisdiction)} (${esc(i.placeOfSupplyRule)}).
  </div>
</div>

</body>
</html>`
}
