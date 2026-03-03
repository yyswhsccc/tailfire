-- ==============================================================================
-- Migration: Rebrand trip-order template to match Alpha V2 Phoenix Voyages design
-- ==============================================================================
-- Full-featured Trip Order matching tailfire-alpha/components/pdf/trip-order-pdf-v2.tsx:
--   - Header with logo + company info + order number box
--   - 3-column info grid (Customer, Service Details, Consultant)
--   - Financial Summary (Trip Order Amount, Payments Received, Balance Due)
--   - Cost Breakdown table with booking line items
--   - Passengers grid
--   - Booking Details cards
--   - Important Disclosures + Documentation Requirements
--   - Footer with TICO / HST
-- Brand: Cinzel headings, Lato body, Phoenix gold #c59746
-- ==============================================================================

UPDATE document_templates
SET
  -- ── blocks_json ──
  blocks_json = '{"blocks":[
    {"id":"header","type":"branding","permission":"branding","content":{"html":"header"}},
    {"id":"info-grid","type":"content","permission":"editable","content":{"html":"info-grid"}},
    {"id":"financial-summary","type":"content","permission":"editable","content":{"html":"financial-summary"}},
    {"id":"cost-breakdown","type":"content","permission":"editable","content":{"html":"cost-breakdown"}},
    {"id":"passengers","type":"content","permission":"editable","content":{"html":"passengers"}},
    {"id":"booking-details","type":"content","permission":"editable","content":{"html":"booking-details"}},
    {"id":"disclosures","type":"content","permission":"locked","content":{"html":"disclosures"}},
    {"id":"footer","type":"branding","permission":"branding","content":{"html":"footer"}}
  ]}'::jsonb,

  -- ── PDF HTML ──
  pdf_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
<div class="trip-order">

  <!-- Header: Logo + Company Info | Order Box -->
  <div class="header">
    <div class="header-row">
      <div class="logo-section">
        {{#if agency.logo}}<img src="{{agency.logo}}" alt="{{agency.name}}" class="logo" />{{/if}}
        <div class="company-info">
          <h1 class="company-name">{{fallback agency.name "Phoenix Voyages"}}</h1>
          <p class="tagline">{{fallback businessConfig.company_tagline "Discover, Soar, Repeat"}}</p>
          {{#if agency.address}}<p class="company-address">{{agency.address}}</p>{{/if}}
          {{#if agency.phone}}<p class="company-address">{{agency.phone}}</p>{{/if}}
          {{#if agency.email}}<p class="company-address">{{agency.email}}</p>{{/if}}
        </div>
      </div>
      <div class="order-box">
        <h2 class="order-title">TRIP ORDER</h2>
        <div class="order-number-box">
          <span class="order-number">Order #: {{fallback trip.referenceNumber trip.reference}}</span>
        </div>
        <p class="order-date">Order Date: {{formatDate trip.startDate "MMM d, yyyy"}}</p>
      </div>
    </div>
  </div>

  <!-- Info Grid: Customer | Service | Consultant -->
  <div class="info-grid">
    <div class="info-box">
      <h5 class="info-label">CUSTOMER INFORMATION</h5>
      <p class="info-value">{{contact.full_name}}</p>
      {{#if contact.email}}<p class="info-value-small">{{contact.email}}</p>{{/if}}
      {{#if contact.phone}}<p class="info-value-small">{{contact.phone}}</p>{{/if}}
      {{#if contact.addressLine1}}<p class="info-value-small">{{contact.addressLine1}}</p>{{/if}}
      {{#if contact.city}}<p class="info-value-small">{{contact.city}}{{#if contact.province}}, {{contact.province}}{{/if}} {{contact.postalCode}}</p>{{/if}}
      {{#if contact.country}}<p class="info-value-small">{{contact.country}}</p>{{/if}}
    </div>
    <div class="info-box">
      <h5 class="info-label">SERVICE DETAILS</h5>
      <p class="info-value">{{trip.name}}</p>
      <p class="info-value-small">Departure: {{formatDate trip.startDate "MMM d, yyyy"}}</p>
      {{#if trip.endDate}}<p class="info-value-small">Return: {{formatDate trip.endDate "MMM d, yyyy"}}</p>{{/if}}
      {{#if trip.destination}}<p class="info-value-small">Destination: {{trip.destination}}</p>{{/if}}
    </div>
    <div class="info-box">
      <h5 class="info-label">YOUR CONSULTANT</h5>
      {{#if agent}}
        <p class="info-value">{{agent.full_name}}</p>
        {{#if agent.email}}<p class="info-value-small">{{agent.email}}</p>{{/if}}
        {{#if agent.phone}}<p class="info-value-small">{{agent.phone}}</p>{{/if}}
      {{else}}
        <p class="info-value">{{fallback agency.name "Phoenix Voyages"}}</p>
      {{/if}}
    </div>
  </div>

  <!-- Financial Summary -->
  <div class="financial-summary">
    <h3 class="financial-title">FINANCIAL SUMMARY</h3>
    <div class="financial-grid">
      <div class="financial-item">
        <span class="financial-label">Trip Order Amount</span>
        <span class="financial-amount gold">{{formatCurrency trip.totalCost trip.currency}}</span>
      </div>
      <div class="financial-item bordered">
        <span class="financial-label">Payments Received</span>
        <span class="financial-amount green">{{formatCurrency payment.amountPaid trip.currency}}</span>
      </div>
      <div class="financial-item">
        <span class="financial-label">Balance Due</span>
        <span class="financial-amount red">{{formatCurrency payment.balanceDue trip.currency}}</span>
      </div>
    </div>
  </div>

  <!-- Cost Breakdown -->
  {{#if bookings}}
  <h3 class="section-title">Cost Breakdown</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th class="cell-left" style="flex:3">Service</th>
        <th class="cell-right" style="flex:2">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each bookings}}
      <tr>
        <td class="cell-left">
          <span class="bold">{{this.title}}</span>
          {{#if this.vendor_confirmation}}<br><span style="font-size:8pt;color:#6b7280;">Ref: {{this.vendor_confirmation}}</span>{{/if}}
        </td>
        <td class="cell-right bold" style="color:#c59746;">{{formatCurrency this.amount this.currency}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr class="table-footer">
        <td class="cell-left bold large">TOTAL COST</td>
        <td class="cell-right bold large" style="color:#c59746;">{{formatCurrency trip.totalCost trip.currency}}</td>
      </tr>
    </tfoot>
  </table>
  {{/if}}

  <!-- Passengers -->
  {{#if passengers}}
  <h3 class="section-title">Passengers</h3>
  <div class="passenger-grid">
    {{#each passengers}}
    <div class="passenger-card">
      <p class="passenger-name">{{index_plus_one @index}}. {{this.full_name}}</p>
      {{#if this.type}}<p class="passenger-type">{{this.type}}</p>{{/if}}
      {{#if this.dateOfBirth}}<p class="passenger-dob">DOB: {{formatDate this.dateOfBirth "MMM d, yyyy"}}</p>{{/if}}
    </div>
    {{/each}}
  </div>
  {{/if}}

  <!-- Booking Details -->
  {{#if bookings}}
  <h3 class="section-title">Booking Details</h3>
  {{#each bookings}}
  <div class="booking-card">
    <div class="booking-header">
      <div>
        <p class="booking-title">{{this.title}}</p>
        <p class="booking-type">{{this.booking_type}}</p>
      </div>
      {{#if this.vendor_confirmation}}
      <div style="text-align:right;">
        <p style="font-size:7pt;color:#6b7280;text-transform:uppercase;">Confirmation #</p>
        <p class="booking-confirmation">{{this.vendor_confirmation}}</p>
      </div>
      {{/if}}
    </div>
    {{#if this.start_date}}
    <p class="booking-dates">
      Start: {{formatDate this.start_date "MMM d, yyyy"}}
      {{#if this.end_date}} &bull; End: {{formatDate this.end_date "MMM d, yyyy"}}{{/if}}
    </p>
    {{/if}}
  </div>
  {{/each}}
  {{/if}}

  <!-- Important Disclosures -->
  <h3 class="section-title">Important Disclosures</h3>
  <div class="disclosure-box">
    <p>This trip order is subject to the terms and conditions of {{fallback agency.name "Phoenix Voyages"}}. All prices are in {{fallback trip.currency "CAD"}} unless otherwise stated. Changes or cancellations may be subject to fees as outlined in your booking agreement.</p>
    <p>It is strongly recommended that all travellers purchase comprehensive travel insurance prior to departure. {{fallback agency.name "Phoenix Voyages"}} is not liable for losses due to trip cancellation, interruption, delay, or medical emergencies.</p>
  </div>

  <!-- Documentation Requirements -->
  <h3 class="section-title">Documentation Requirements</h3>
  <div class="disclosure-box">
    <p><strong>Passport Requirements:</strong> All travellers must have a valid passport with at least 6 months validity beyond the return date. Please verify entry requirements for all destinations on your itinerary.</p>
    <p><strong>Travel Insurance:</strong> Comprehensive travel insurance including medical, trip cancellation, and baggage coverage is strongly recommended for all travellers.</p>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-row">
      <div class="footer-left">
        {{#if businessConfig.tico_registration}}<p>TICO: {{businessConfig.tico_registration}}</p>{{/if}}
        {{#if businessConfig.hst_number}}<p>HST: {{businessConfig.hst_number}}</p>{{/if}}
      </div>
      <div class="footer-center">
        <p><strong>{{fallback agency.name "Phoenix Voyages"}}</strong></p>
        <p>{{agency.phone}} | {{agency.email}}</p>
      </div>
      <div class="footer-right">
        <p>{{formatDate "now" "MMM d, yyyy"}}</p>
      </div>
    </div>
    <p class="retain-notice">Please retain this document for your records</p>
  </div>

</div>
</body>
</html>',

  -- ── PDF CSS ──
  pdf_css = '/* Phoenix Voyages Trip Order — Alpha V2 Design */
@import url(''https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@400;700&display=swap'');

body {
  font-family: ''Lato'', ''Helvetica Neue'', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.6;
  color: #111827;
  margin: 0;
  padding: 0;
}
.trip-order {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px;
  background: #ffffff;
}

/* ── Header ── */
.header {
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 20px;
  margin-bottom: 20px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.logo-section {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
}
.company-info { margin-top: 4px; }
.company-name {
  font-family: ''Cinzel'', serif;
  font-weight: 700;
  font-size: 20pt;
  color: #c59746;
  margin: 0 0 2px 0;
  text-transform: uppercase;
}
.tagline {
  font-family: ''Cinzel'', serif;
  font-size: 11pt;
  color: #e89e4a;
  margin: 0 0 6px 0;
}
.company-address {
  font-size: 9pt;
  color: #374151;
  line-height: 1.3;
  margin: 0 0 2px 0;
}
.order-box { text-align: right; }
.order-title {
  font-family: ''Cinzel'', serif;
  font-weight: 700;
  font-size: 16pt;
  color: #1a1a1a;
  margin: 0 0 4px 0;
}
.order-number-box {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
  display: inline-block;
}
.order-number {
  font-size: 14pt;
  font-weight: 700;
  color: #c59746;
}
.order-date {
  font-size: 9pt;
  color: #4b5563;
  margin: 6px 0 0 0;
}

/* ── Info Grid ── */
.info-grid {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.info-box {
  flex: 1;
  background: #f9fafb;
  padding: 10px;
  border-radius: 6px;
}
.info-label {
  font-weight: 700;
  font-size: 9pt;
  color: #111827;
  margin: 0 0 6px 0;
  text-transform: uppercase;
}
.info-value {
  font-size: 10pt;
  font-weight: 500;
  color: #111827;
  margin: 0 0 2px 0;
}
.info-value-small {
  font-size: 9pt;
  color: #4b5563;
  margin: 0 0 1px 0;
}

/* ── Financial Summary ── */
.financial-summary {
  background: #f9fafb;
  border: 2px solid #d1d5db;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}
.financial-title {
  font-family: ''Cinzel'', serif;
  font-weight: 700;
  font-size: 14pt;
  color: #111827;
  text-align: center;
  margin: 0 0 12px 0;
  text-transform: uppercase;
}
.financial-grid {
  display: flex;
  justify-content: space-around;
}
.financial-item {
  flex: 1;
  text-align: center;
  padding: 0 8px;
}
.financial-item.bordered {
  border-left: 1px solid #d1d5db;
  border-right: 1px solid #d1d5db;
}
.financial-label {
  display: block;
  font-size: 9pt;
  color: #4b5563;
  font-weight: 500;
  margin-bottom: 4px;
}
.financial-amount {
  display: block;
  font-size: 18pt;
  font-weight: 700;
}
.financial-amount.gold { color: #c59746; }
.financial-amount.green { color: #22c55e; }
.financial-amount.red { color: #ef4444; }

/* ── Section Headers ── */
.section-title {
  font-family: ''Cinzel'', serif;
  font-weight: 700;
  font-size: 13pt;
  color: #111827;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 6px;
  margin: 16px 0 12px 0;
}

/* ── Data Tables ── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}
.data-table thead tr {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.data-table th {
  font-weight: 700;
  font-size: 9pt;
  color: #374151;
  padding: 6px 8px;
}
.data-table td {
  font-size: 9pt;
  color: #111827;
  padding: 8px;
  border-bottom: 1px solid #f3f4f6;
}
.cell-left { text-align: left; }
.cell-right { text-align: right; }
.bold { font-weight: 700; }
.large { font-size: 11pt; }
.table-footer td {
  background: #f9fafb;
  border-top: 2px solid #9ca3af;
  padding: 8px;
  font-size: 10pt;
}

/* ── Passengers ── */
.passenger-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.passenger-card {
  flex: 1;
  min-width: 200px;
  background: #f9fafb;
  padding: 8px 12px;
  border-radius: 6px;
}
.passenger-name {
  font-size: 10pt;
  font-weight: 600;
  color: #111827;
  margin: 0 0 2px 0;
}
.passenger-type {
  font-size: 8pt;
  color: #c59746;
  font-weight: 600;
  text-transform: capitalize;
  margin: 0 0 2px 0;
}
.passenger-dob {
  font-size: 8pt;
  color: #4b5563;
  margin: 0;
}

/* ── Booking Cards ── */
.booking-card {
  background: #f9fafb;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.booking-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.booking-title {
  font-size: 10pt;
  font-weight: 600;
  color: #111827;
  margin: 0 0 2px 0;
}
.booking-type {
  font-size: 8pt;
  color: #4b5563;
  text-transform: capitalize;
  margin: 0;
}
.booking-confirmation {
  font-size: 10pt;
  font-weight: 700;
  color: #c59746;
  margin: 0;
}
.booking-dates {
  font-size: 8pt;
  color: #4b5563;
  margin: 4px 0 0 0;
}

/* ── Disclosure ── */
.disclosure-box {
  background: #f9fafb;
  padding: 14px;
  border-radius: 4px;
  margin-bottom: 16px;
}
.disclosure-box p {
  font-size: 8pt;
  color: #374151;
  line-height: 1.5;
  margin: 0 0 6px 0;
}
.disclosure-box p:last-child { margin-bottom: 0; }

/* ── Footer ── */
.footer {
  border-top: 1px solid #e5e7eb;
  margin-top: 24px;
  padding-top: 12px;
  font-size: 8pt;
  color: #4b5563;
}
.footer-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
.footer p { margin: 1px 0; }
.retain-notice {
  text-align: center;
  margin-top: 6px;
  font-size: 8pt;
  color: #6b7280;
}

@media print {
  body { margin: 0; }
  .trip-order { padding: 0; page-break-inside: avoid; }
}',

  -- ── Email HTML ──
  email_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

    <!-- Header with Phoenix Voyages branding -->
    <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0;">{{fallback agency.name "Phoenix Voyages"}}</h1>
      <p style="color: #ffffff; font-size: 14px; opacity: 0.9; margin: 10px 0 0 0;">Discover, Soar, Repeat</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 40px;">
      <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 20px 0;">Trip Order Confirmation</h2>

      <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Dear {{contact.full_name}},
      </p>

      <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Thank you for choosing {{fallback agency.name "Phoenix Voyages"}}! We are excited to help you plan your upcoming journey.
      </p>

      <!-- Trip Details Box -->
      <div style="background-color: #fdf8f0; border-left: 4px solid #c59746; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <h3 style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">Trip Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;"><strong>Trip Name:</strong></td>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;">{{trip.name}}</td>
          </tr>
          <tr>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;"><strong>Reference:</strong></td>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;">{{fallback trip.referenceNumber trip.reference}}</td>
          </tr>
          <tr>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;"><strong>Start Date:</strong></td>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;">{{formatDate trip.startDate "MMM d, yyyy"}}</td>
          </tr>
          <tr>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;"><strong>End Date:</strong></td>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;">{{formatDate trip.endDate "MMM d, yyyy"}}</td>
          </tr>
          <tr>
            <td style="color: #4a5568; font-size: 14px; padding: 5px 0;"><strong>Total:</strong></td>
            <td style="color: #c59746; font-size: 14px; font-weight: 700; padding: 5px 0;">{{formatCurrency trip.totalCost trip.currency}}</td>
          </tr>
        </table>
      </div>

      <!-- Agent Contact Section -->
      {{#if agent}}
      <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e2e8f0;">
        <h3 style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">Your Travel Consultant</h3>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0;">
          <strong>{{agent.full_name}}</strong><br>
          {{#if agent.email}}{{agent.email}}<br>{{/if}}
          {{#if agent.phone}}{{agent.phone}}{{/if}}
        </p>
      </div>
      {{/if}}

      <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
        If you have any questions or need to make changes to your trip, please don''t hesitate to contact us.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #1a1a1a; padding: 30px; text-align: center;">
      <p style="color: #d1d5db; font-size: 14px; font-weight: 600; margin: 0 0 5px 0;">{{fallback agency.name "Phoenix Voyages"}}</p>
      {{#if agency.phone}}<p style="color: #9ca3af; font-size: 12px; margin: 0 0 3px 0;">{{agency.phone}}</p>{{/if}}
      {{#if agency.email}}<p style="color: #9ca3af; font-size: 12px; margin: 0 0 10px 0;">{{agency.email}}</p>{{/if}}
      {{#if businessConfig.tico_registration}}<p style="color: #6b7280; font-size: 11px; margin: 0;">TICO Registration: {{businessConfig.tico_registration}}</p>{{/if}}
    </div>
  </div>
</body>
</html>',

  -- ── Subject Template ──
  subject_template = 'Your Trip Order - {{trip.name}} ({{fallback trip.referenceNumber trip.reference}})',

  -- ── Text Template ──
  text_template = '{{fallback agency.name "Phoenix Voyages"}}
Discover, Soar, Repeat

TRIP ORDER CONFIRMATION
=======================

Dear {{contact.full_name}},

Thank you for choosing {{fallback agency.name "Phoenix Voyages"}}! We are excited to help you plan your upcoming journey.

TRIP DETAILS
------------
Trip Name: {{trip.name}}
Reference: {{fallback trip.referenceNumber trip.reference}}
Start Date: {{formatDate trip.startDate "MMM d, yyyy"}}
End Date: {{formatDate trip.endDate "MMM d, yyyy"}}
Total: {{formatCurrency trip.totalCost trip.currency}}

{{#if agent}}
YOUR TRAVEL CONSULTANT
{{agent.full_name}}
Email: {{agent.email}}
{{/if}}

{{#if bookings}}
BOOKINGS
--------
{{#each bookings}}
- {{this.title}} ({{this.booking_type}})
  {{#if this.start_date}}Dates: {{formatDate this.start_date "MMM d, yyyy"}}{{#if this.end_date}} - {{formatDate this.end_date "MMM d, yyyy"}}{{/if}}{{/if}}
  Amount: {{formatCurrency this.amount this.currency}}
  {{#if this.vendor_confirmation}}Confirmation: {{this.vendor_confirmation}}{{/if}}
{{/each}}
{{/if}}

{{#if passengers}}
PASSENGERS
----------
{{#each passengers}}
{{index_plus_one @index}}. {{this.full_name}} ({{this.type}}){{#if this.dateOfBirth}} - DOB: {{formatDate this.dateOfBirth "MMM d, yyyy"}}{{/if}}
{{/each}}
{{/if}}

If you have any questions or need to make changes to your trip, please don''t hesitate to contact us.

IMPORTANT DISCLOSURES
---------------------
This trip order is subject to the terms and conditions of {{fallback agency.name "Phoenix Voyages"}}.
All prices are in {{fallback trip.currency "CAD"}} unless otherwise stated.
Changes or cancellations may be subject to fees as outlined in your booking agreement.

It is strongly recommended that all travellers purchase comprehensive travel insurance
prior to departure. {{fallback agency.name "Phoenix Voyages"}} is not liable for losses due to trip cancellation,
interruption, delay, or medical emergencies.

---
{{fallback agency.name "Phoenix Voyages"}} | {{agency.phone}} | {{agency.email}}
{{#if businessConfig.tico_registration}}TICO #{{businessConfig.tico_registration}}{{/if}}
Please retain this document for your records.',

  -- ── Variables metadata ──
  variables = '{
    "trip": ["name", "referenceNumber", "reference", "startDate", "endDate", "status", "totalCost", "currency", "destination"],
    "agent": ["full_name", "name", "email", "phone"],
    "agency": ["name", "email", "phone", "address", "website", "logo"],
    "contact": ["full_name", "first_name", "last_name", "email", "phone", "addressLine1", "city", "province", "postalCode", "country"],
    "payment": ["amountPaid", "balanceDue", "currency"],
    "passengers": ["full_name", "firstName", "lastName", "type", "dateOfBirth", "email"],
    "bookings": ["title", "booking_type", "vendor_confirmation", "start_date", "end_date", "amount", "currency"],
    "businessConfig": ["company_name", "company_tagline", "tico_registration", "hst_number", "logo_url", "primary_color"]
  }'::jsonb,

  updated_at = NOW()
WHERE slug = 'trip-order'
  AND agency_id IS NULL;
