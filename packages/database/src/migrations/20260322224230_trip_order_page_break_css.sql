-- Add page-break CSS rules to trip-order document template
-- Prevents sections from being split across page breaks in Puppeteer PDF rendering

UPDATE document_templates
SET pdf_css = REPLACE(
  pdf_css,
  '@media print {',
  '/* ── Page Break Control ── */
 .section-title { page-break-after: avoid; }
 .booking-card { page-break-inside: avoid; }
 .passenger-card { page-break-inside: avoid; }
 .passenger-grid { page-break-inside: avoid; }
 .info-box { page-break-inside: avoid; }
 .info-grid { page-break-inside: avoid; }
 .financial-summary { page-break-inside: avoid; }
 .financial-grid { page-break-inside: avoid; }
 .disclosure-box { page-break-inside: avoid; }
 .data-table { page-break-inside: avoid; }
 .footer { page-break-inside: avoid; }
 .header { page-break-inside: avoid; }
 .table-footer { page-break-inside: avoid; }

 @media print {'
)
WHERE slug = 'trip-order'
  AND pdf_css NOT LIKE '%Page Break Control%';

-- Also remove the incorrect page-break-inside: avoid on .trip-order
-- (was trying to keep entire multi-page document on one page)
UPDATE document_templates
SET pdf_css = REPLACE(
  pdf_css,
  '.trip-order { padding: 0; page-break-inside: avoid; }',
  '.trip-order { padding: 0; }'
)
WHERE slug = 'trip-order';
