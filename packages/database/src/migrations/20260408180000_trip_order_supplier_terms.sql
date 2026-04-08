-- ==============================================================================
-- Migration: Add supplier T&C and cancellation policy to trip-order booking cards
-- ==============================================================================
-- TICO requires supplier-specific terms on invoices. The booking cards in the
-- Booking Details section now display terms_and_conditions and cancellation_policy
-- when available (sourced from supplier library defaults or activity-level overrides).
-- ==============================================================================

-- Add T&C and cancellation policy to each booking card
-- The template uses {{#each bookings}} in the Booking Details section
UPDATE document_templates
SET
  pdf_html = REPLACE(
    pdf_html,
    '{{#if this.start_date}}
    <p class="booking-dates">
      Start: {{formatDate this.start_date "MMM d, yyyy"}}
      {{#if this.end_date}} &bull; End: {{formatDate this.end_date "MMM d, yyyy"}}{{/if}}
    </p>
    {{/if}}
  </div>',
    '{{#if this.start_date}}
    <p class="booking-dates">
      Start: {{formatDate this.start_date "MMM d, yyyy"}}
      {{#if this.end_date}} &bull; End: {{formatDate this.end_date "MMM d, yyyy"}}{{/if}}
    </p>
    {{/if}}
    {{#if this.supplier}}<p style="font-size:8pt;color:#6b7280;margin-top:4px;">Supplier: {{this.supplier}}</p>{{/if}}
    {{#if this.terms_and_conditions}}
    <div style="margin-top:6px;padding:6px 8px;background:#f9fafb;border-radius:4px;font-size:7.5pt;color:#374151;">
      <p style="font-weight:600;margin-bottom:2px;">Terms &amp; Conditions</p>
      <p style="white-space:pre-wrap;">{{this.terms_and_conditions}}</p>
    </div>
    {{/if}}
    {{#if this.cancellation_policy}}
    <div style="margin-top:4px;padding:6px 8px;background:#fef3c7;border-radius:4px;font-size:7.5pt;color:#92400e;">
      <p style="font-weight:600;margin-bottom:2px;">Cancellation Policy</p>
      <p style="white-space:pre-wrap;">{{this.cancellation_policy}}</p>
    </div>
    {{/if}}
  </div>'
  ),
  updated_at = NOW()
WHERE slug = 'trip-order';
