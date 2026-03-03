-- ==============================================================================
-- Migration: Seed trip-order system document template
-- ==============================================================================
-- Inserts a system-level (agency_id IS NULL) document template for trip orders.
-- Supports both email and PDF output. Uses Handlebars variables for rendering.
-- Idempotent via ON CONFLICT DO NOTHING on the system slug unique index.
-- ==============================================================================

INSERT INTO document_templates (
  slug,
  name,
  description,
  category,
  output_types,
  blocks_json,
  pdf_html,
  pdf_css,
  email_html,
  subject_template,
  text_template,
  variables,
  status,
  published_at,
  version,
  is_active,
  created_at,
  updated_at
) VALUES (
  'trip-order',
  'Trip Order',
  'Official trip order document sent to clients with trip details, itinerary summary, and payment information.',
  'trip_order',
  '{email,pdf}',

  -- blocks_json: defines the editor block structure
  '{
    "blocks": [
      {
        "id": "header",
        "type": "branding",
        "permission": "branding",
        "content": {
          "html": "<div class=\"header\"><img src=\"{{agency.logo}}\" alt=\"{{agency.name}}\" class=\"logo\" /><div class=\"agency-info\"><h3>{{agency.name}}</h3><p>{{agency.phone}} | {{agency.email}}</p></div></div>"
        }
      },
      {
        "id": "title",
        "type": "heading",
        "permission": "locked",
        "content": {
          "html": "<h1>Trip Order #{{trip.reference}}</h1>"
        }
      },
      {
        "id": "client-info",
        "type": "text",
        "permission": "locked",
        "content": {
          "html": "<div class=\"client-info\"><h2>Client Information</h2><table><tr><td><strong>Name:</strong></td><td>{{contact.full_name}}</td></tr><tr><td><strong>Email:</strong></td><td>{{contact.email}}</td></tr><tr><td><strong>Phone:</strong></td><td>{{fallback contact.phone \"N/A\"}}</td></tr></table></div>"
        }
      },
      {
        "id": "trip-details",
        "type": "text",
        "permission": "editable",
        "content": {
          "html": "<div class=\"trip-details\"><h2>Trip Details</h2><table><tr><td><strong>Trip Name:</strong></td><td>{{trip.name}}</td></tr><tr><td><strong>Dates:</strong></td><td>{{formatDate trip.startDate \"MMM d, yyyy\"}} - {{formatDate trip.endDate \"MMM d, yyyy\"}}</td></tr><tr><td><strong>Status:</strong></td><td>{{trip.status}}</td></tr><tr><td><strong>Total Cost:</strong></td><td>{{formatCurrency trip.totalCost trip.currency}}</td></tr></table></div>"
        }
      },
      {
        "id": "disclosure",
        "type": "text",
        "permission": "locked",
        "content": {
          "html": "<div class=\"disclosure\"><p>This trip order is subject to the terms and conditions of {{agency.name}}. All prices are in {{fallback trip.currency \"CAD\"}} unless otherwise stated. Changes or cancellations may be subject to fees as outlined in your booking agreement.</p></div>"
        }
      },
      {
        "id": "footer",
        "type": "branding",
        "permission": "branding",
        "content": {
          "html": "<div class=\"footer\"><p>{{agency.name}} | {{agency.phone}} | {{agency.email}}</p><p>{{fallback agency.website \"\"}}</p></div>"
        }
      }
    ]
  }'::jsonb,

  -- pdf_html: full Handlebars template for PDF rendering
  '<div class="trip-order">
  <div class="header">
    {{#if agency.logo}}
    <img src="{{agency.logo}}" alt="{{agency.name}}" class="logo" />
    {{/if}}
    <div class="agency-info">
      <h3>{{agency.name}}</h3>
      <p>{{agency.phone}} | {{agency.email}}</p>
      {{#if agency.website}}<p>{{agency.website}}</p>{{/if}}
    </div>
  </div>

  <h1>Trip Order #{{trip.reference}}</h1>
  <p class="date-generated">Generated: {{formatDate "now" "MMM d, yyyy"}}</p>

  <div class="section client-info">
    <h2>Client Information</h2>
    <table>
      <tr><td><strong>Name:</strong></td><td>{{contact.full_name}}</td></tr>
      <tr><td><strong>Email:</strong></td><td>{{contact.email}}</td></tr>
      <tr><td><strong>Phone:</strong></td><td>{{fallback contact.phone "N/A"}}</td></tr>
    </table>
  </div>

  <div class="section trip-details">
    <h2>Trip Details</h2>
    <table>
      <tr><td><strong>Trip Name:</strong></td><td>{{trip.name}}</td></tr>
      <tr><td><strong>Reference:</strong></td><td>{{trip.reference}}</td></tr>
      <tr><td><strong>Dates:</strong></td><td>{{formatDate trip.startDate "MMM d, yyyy"}} - {{formatDate trip.endDate "MMM d, yyyy"}}</td></tr>
      <tr><td><strong>Status:</strong></td><td>{{trip.status}}</td></tr>
      <tr><td><strong>Total Cost:</strong></td><td>{{formatCurrency trip.totalCost trip.currency}}</td></tr>
    </table>
  </div>

  {{#if agent}}
  <div class="section agent-info">
    <h2>Your Travel Advisor</h2>
    <table>
      <tr><td><strong>Name:</strong></td><td>{{agent.full_name}}</td></tr>
      <tr><td><strong>Email:</strong></td><td>{{agent.email}}</td></tr>
    </table>
  </div>
  {{/if}}

  <div class="section disclosure">
    <h2>Terms &amp; Conditions</h2>
    <p>This trip order is subject to the terms and conditions of {{agency.name}}.
    All prices are in {{fallback trip.currency "CAD"}} unless otherwise stated.
    Changes or cancellations may be subject to fees as outlined in your booking agreement.</p>
  </div>

  <div class="footer">
    <p>{{agency.name}} | {{agency.phone}} | {{agency.email}}</p>
    {{#if agency.website}}<p>{{agency.website}}</p>{{/if}}
  </div>
</div>',

  -- pdf_css: print-ready CSS for PDF rendering
  '/* Trip Order PDF Styles */
body {
  font-family: "Helvetica Neue", Arial, sans-serif;
  color: #333;
  font-size: 12pt;
  line-height: 1.5;
  margin: 0;
  padding: 0;
}

.trip-order {
  max-width: 100%;
}

.header {
  display: flex;
  align-items: center;
  border-bottom: 2px solid #2563eb;
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.header .logo {
  max-height: 60px;
  max-width: 180px;
  margin-right: 20px;
}

.header .agency-info h3 {
  margin: 0 0 4px 0;
  font-size: 16pt;
  color: #1e40af;
}

.header .agency-info p {
  margin: 0;
  font-size: 10pt;
  color: #6b7280;
}

h1 {
  font-size: 20pt;
  color: #1e3a5f;
  margin: 0 0 4px 0;
}

.date-generated {
  font-size: 10pt;
  color: #6b7280;
  margin: 0 0 24px 0;
}

.section {
  margin-bottom: 24px;
}

.section h2 {
  font-size: 14pt;
  color: #1e3a5f;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 6px;
  margin-bottom: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

table td {
  padding: 4px 8px;
  vertical-align: top;
}

table td:first-child {
  width: 140px;
  white-space: nowrap;
}

.disclosure {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 16px;
}

.disclosure p {
  font-size: 9pt;
  color: #6b7280;
  margin: 0;
}

.footer {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
  margin-top: 32px;
  text-align: center;
}

.footer p {
  margin: 2px 0;
  font-size: 9pt;
  color: #9ca3af;
}

@media print {
  body { margin: 0; }
  .trip-order { page-break-inside: avoid; }
}',

  -- email_html: HTML for email rendering (simpler layout)
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
    <h2 style="margin: 0; color: #1e40af;">{{agency.name}}</h2>
  </div>

  <h1 style="font-size: 22px; color: #1e3a5f; margin-bottom: 4px;">Trip Order #{{trip.reference}}</h1>

  <p>Dear {{contact.full_name}},</p>

  <p>Please find your trip order details below:</p>

  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 6px 8px;"><strong>Trip:</strong></td><td style="padding: 6px 8px;">{{trip.name}}</td></tr>
    <tr><td style="padding: 6px 8px;"><strong>Dates:</strong></td><td style="padding: 6px 8px;">{{formatDate trip.startDate "MMM d, yyyy"}} - {{formatDate trip.endDate "MMM d, yyyy"}}</td></tr>
    <tr><td style="padding: 6px 8px;"><strong>Total:</strong></td><td style="padding: 6px 8px;">{{formatCurrency trip.totalCost trip.currency}}</td></tr>
  </table>

  <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
    This trip order is subject to the terms and conditions of {{agency.name}}.
  </p>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 24px; text-align: center; font-size: 12px; color: #9ca3af;">
    <p>{{agency.name}} | {{agency.phone}} | {{agency.email}}</p>
  </div>
</div>',

  -- subject_template
  'Trip Order #{{trip.reference}} - {{agency.name}}',

  -- text_template: plain text version
  'Trip Order #{{trip.reference}}
{{agency.name}}

Dear {{contact.full_name}},

Your trip order details:

Trip: {{trip.name}}
Reference: {{trip.reference}}
Dates: {{formatDate trip.startDate "MMM d, yyyy"}} - {{formatDate trip.endDate "MMM d, yyyy"}}
Total: {{formatCurrency trip.totalCost trip.currency}}

This trip order is subject to the terms and conditions of {{agency.name}}.

{{agency.name}} | {{agency.phone}} | {{agency.email}}',

  -- variables: describes which template variables are used
  '{
    "agency": ["name", "email", "phone", "website", "logo"],
    "contact": ["full_name", "first_name", "last_name", "email", "phone"],
    "trip": ["name", "reference", "startDate", "endDate", "status", "totalCost", "currency"],
    "agent": ["full_name", "email"]
  }'::jsonb,

  -- status
  'published',

  -- published_at
  NOW(),

  -- version
  1,

  -- is_active
  true,

  -- timestamps
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
