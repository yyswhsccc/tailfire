/**
 * Unit Tests: renderInvoiceHtml template function
 *
 * Tests XSS escaping, negative-amount styling, tax display variants,
 * and structural correctness of the rendered HTML.
 */

import { renderInvoiceHtml } from '../invoice-template.html'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: 'INV-2026-12345678-000001',
    invoiceDate: '2026-05-10',
    currency: 'CAD',
    reportableBaseCents: 50_000,
    taxCents: 6_500,
    totalCents: 56_500,
    taxType: 'HST',
    taxRateBp: 1300,
    placeOfSupplyJurisdiction: 'ON',
    placeOfSupplyRule: 'general-recipient-address',
    ...overrides,
  } as any
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: 'inv-1',
    lineType: 'commission',
    amountCents: 50_000,
    currency: 'CAD',
    description: 'Commission on booking',
    tripRef: 'TRIP-001',
    ...overrides,
  } as any
}

function makeBaseInput(
  invoiceOverrides: Record<string, unknown> = {},
  lineOverrides: Record<string, unknown> = {},
) {
  return {
    invoice: makeInvoice(invoiceOverrides),
    lines: [makeLine(lineOverrides)],
    agencyLegalName: 'Phoenix Voyages Inc.',
    agencyAddressLines: ['1 King St W', 'Toronto, ON  M5H 1A1'],
    agencyBn15: '****1234',
    icLegalName: 'Mary Agent',
    icAddress: { street: '123 Main St', city: 'Ottawa', province: 'ON', postalCode: 'K1A 0A6' },
    icGstHstNumber: '123456789RT0001',
    icSinOrBnMask: '***-***-789',
    rctiAgreementVersion: 'v1-2026-05',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderInvoiceHtml', () => {
  // ── XSS escaping ────────────────────────────────────────────────────────────

  it('escapes special chars in trip ref and description', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      lines: [makeLine({
        description: 'Resort <booking> & "package"',
        tripRef: 'Smith Family <Disney>',
      })],
    })

    expect(html).toContain('Resort &lt;booking&gt; &amp; &quot;package&quot;')
    expect(html).toContain('Smith Family &lt;Disney&gt;')
    // Ensure raw unescaped strings are NOT present
    expect(html).not.toContain('<booking>')
    expect(html).not.toContain('Smith Family <Disney>')
  })

  it('escapes special chars in IC legal name', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      icLegalName: 'O\'Brien & Associates <Travel>',
    })

    expect(html).toContain('O&#39;Brien &amp; Associates &lt;Travel&gt;')
    expect(html).not.toContain("O'Brien & Associates <Travel>")
  })

  it('escapes special chars in agency legal name', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      agencyLegalName: 'Travel Co. & Sons <Ltd>',
    })

    expect(html).toContain('Travel Co. &amp; Sons &lt;Ltd&gt;')
    expect(html).not.toContain('Travel Co. & Sons <Ltd>')
  })

  it('escapes special chars in agency address lines', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      agencyAddressLines: ['Suite <100> & Building "A"'],
    })

    expect(html).toContain('Suite &lt;100&gt; &amp; Building &quot;A&quot;')
  })

  it('escapes invoice number in title and meta', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      invoice: makeInvoice({ invoiceNumber: 'INV-<SCRIPT>' }),
    })

    expect(html).toContain('INV-&lt;SCRIPT&gt;')
    expect(html).not.toContain('INV-<SCRIPT>')
  })

  // ── Tax display ─────────────────────────────────────────────────────────────

  it('shows HST line with percentage when taxCents > 0', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { taxCents: 6_500, taxRateBp: 1300, taxType: 'HST' },
    ))

    expect(html).toContain('HST (13.00%)')
  })

  it('shows QST line with percentage when taxCents > 0 (QC rate)', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { taxCents: 4_975, taxRateBp: 997, taxType: 'GST+QST' },
    ))

    expect(html).toContain('GST+QST (9.97%)')
  })

  it('shows "NONE" tax row without percentage when IC is not GST-registered', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { taxCents: 0, taxRateBp: 0, taxType: 'NONE' },
    ))

    // Should show NONE label
    expect(html).toContain('NONE')
    // Should NOT show "NONE (0.00%)" — no rate is shown when taxType=NONE
    expect(html).not.toContain('NONE (0.00%)')
    // Amount shown is zero (CAD 0.00)
    expect(html).toContain('CAD 0.00')
  })

  it('does NOT show tax percentage row when taxCents is 0', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { taxCents: 0, taxRateBp: 0, taxType: 'NONE' },
    ))

    // No "(0.00%)" pattern should appear in the tax row
    expect(html).not.toMatch(/NONE\s*\(0\.00%\)/)
  })

  // ── Negative amounts ─────────────────────────────────────────────────────────

  it('applies "negative" CSS class to negative-amount lines', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      lines: [makeLine({ lineType: 'adjustment', amountCents: -5_000 })],
    })

    expect(html).toContain('class="amount negative"')
  })

  it('shows "(adjustment)" label for adjustment line type', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      lines: [makeLine({ lineType: 'adjustment', amountCents: -5_000, description: 'Clawback' })],
    })

    expect(html).toContain('(adjustment)')
  })

  it('does NOT apply "negative" class to positive lines', () => {
    const html = renderInvoiceHtml(makeBaseInput())

    // Commission lines are positive — should not have the negative class
    expect(html).not.toContain('class="amount negative"')
  })

  // ── Totals formatting ────────────────────────────────────────────────────────

  it('formats amounts in correct currency format (CAD X.XX)', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { reportableBaseCents: 50_000, taxCents: 6_500, totalCents: 56_500, currency: 'CAD' },
    ))

    expect(html).toContain('CAD 500.00')  // base
    expect(html).toContain('CAD 65.00')   // tax
    expect(html).toContain('CAD 565.00')  // total
  })

  it('formats USD amounts correctly', () => {
    const html = renderInvoiceHtml(makeBaseInput(
      { currency: 'USD', reportableBaseCents: 100_000, taxCents: 0, totalCents: 100_000, taxType: 'NONE', taxRateBp: 0 },
    ))

    expect(html).toContain('USD 1000.00')
  })

  // ── IC identity block ────────────────────────────────────────────────────────

  it('shows GST/HST number when provided', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('GST/HST #: 123456789RT0001')
  })

  it('omits GST/HST block when null', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      icGstHstNumber: null,
    })

    expect(html).not.toContain('GST/HST #:')
  })

  it('shows SIN/BN mask when provided', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('***-***-789')
  })

  it('omits SIN/BN block when null', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      icSinOrBnMask: null,
    })

    // The mask is not shown when null (no div for it)
    // Check that the specific mask value is absent (not that the element is absent — we just check value)
    expect(html).not.toContain('***-***-789')
  })

  // ── Agency identity block ────────────────────────────────────────────────────

  it('shows masked agency BN15 in agency block', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('BN: ****1234')
  })

  it('renders all agency address lines', () => {
    const html = renderInvoiceHtml({
      ...makeBaseInput(),
      agencyAddressLines: ['1 King St W', 'Suite 500', 'Toronto, ON  M5H 1A1'],
    })

    expect(html).toContain('1 King St W')
    expect(html).toContain('Suite 500')
    expect(html).toContain('Toronto, ON  M5H 1A1')
  })

  // ── RCTI footer ──────────────────────────────────────────────────────────────

  it('includes RCTI agreement version in footer', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('v1-2026-05')
  })

  it('includes place-of-supply jurisdiction in footer', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('ON')
    expect(html).toContain('general-recipient-address')
  })

  // ── Valid HTML structure ─────────────────────────────────────────────────────

  it('produces valid HTML structure (DOCTYPE, html, head, body)', () => {
    const html = renderInvoiceHtml(makeBaseInput())

    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i)
    expect(html).toContain('<html')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html).toContain('</html>')
  })

  it('includes invoice number in <title>', () => {
    const html = renderInvoiceHtml(makeBaseInput())
    expect(html).toContain('<title>Invoice INV-2026-12345678-000001</title>')
  })
})
