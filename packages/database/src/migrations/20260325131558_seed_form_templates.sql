-- Unified Template System: seed form templates
-- Insurance Proposal Email, Insurance Waiver Form, Client Intake Form

-- 1. Insurance Proposal Email (channel: email)
INSERT INTO document_templates (slug, name, description, category, channel, subject_template, email_html, text_template, variables, output_types, status, is_system, is_active, blocks_json)
SELECT
  'insurance-proposal-email',
  'Insurance Proposal Email',
  'Sent to travelers to review insurance options. Contains a link to the waiver form.',
  'email',
  'email',
  'Insurance Coverage — {{trip_name}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f4f4f5;"><div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;"><div style="background:white;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="text-align:center;margin-bottom:24px;"><h1 style="margin:0;color:#c59746;font-size:24px;">{{agency_name}}</h1></div><h2 style="margin:0 0 16px;color:#18181b;font-size:20px;">Insurance Coverage for Your Trip</h2><p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.5;">Dear {{traveler_name}},</p><p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.5;">As part of your upcoming trip <strong>{{trip_name}}</strong> ({{trip_dates}}), we want to ensure you have appropriate insurance coverage for your travels.</p><p style="margin:0 0 24px;color:#3f3f46;font-size:16px;line-height:1.5;">Please review the available insurance options using the link below.</p><div style="text-align:center;margin:32px 0;"><a href="{{waiver_url}}" style="display:inline-block;background-color:#c59746;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:600;">Review Insurance Options</a></div><p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.5;">This link will expire on {{expires_date}}.</p><hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;"><p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5;text-align:center;">{{agency_name}}</p></div></div></body></html>',
  'Dear {{traveler_name}}, please review insurance options for your trip {{trip_name}} ({{trip_dates}}): {{waiver_url}} — {{agency_name}}',
  '[{"name":"agency_name","description":"Agency company name"},{"name":"traveler_name","description":"Recipient name"},{"name":"trip_name","description":"Trip name"},{"name":"trip_dates","description":"Trip date range"},{"name":"waiver_url","description":"Link to waiver form"},{"name":"expires_date","description":"Form expiry date"}]'::jsonb,
  '{email}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates WHERE slug = 'insurance-proposal-email' AND agency_id IS NULL
);

-- 2. Insurance Waiver Form (channel: form)
INSERT INTO document_templates (slug, name, description, category, channel, form_json, email_html, variables, output_types, status, is_system, is_active, blocks_json)
SELECT
  'insurance-waiver-form',
  'Insurance Waiver Form',
  'Client-facing form for travelers to purchase insurance or sign a waiver.',
  'form',
  'form',
  '{"fields":[{"id":"decision","type":"radio","label":"Insurance Decision","required":true,"options":["I want to purchase insurance","I decline insurance coverage"]},{"id":"package_id","type":"select","label":"Select Insurance Package","required":true,"showWhen":{"field":"decision","value":"I want to purchase insurance"}},{"id":"acknowledge","type":"checkbox","label":"I understand that by declining insurance, I assume all financial risk for trip cancellation, medical emergencies, and other travel-related losses.","required":true,"showWhen":{"field":"decision","value":"I decline insurance coverage"}},{"id":"reason","type":"textarea","label":"Reason for declining (optional)","showWhen":{"field":"decision","value":"I decline insurance coverage"}}],"settings":{"submitButtonText":"Submit Decision"}}'::jsonb,
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h1 style="color:#c59746;">{{agency_name}}</h1><h2>Insurance Coverage — {{trip_name}}</h2><p>Dear {{traveler_name}},</p><p>Please review the insurance options for your trip ({{trip_dates}}).</p>{{{form_fields}}}<p style="color:#71717a;font-size:12px;margin-top:24px;">This form expires on {{expires_date}}.</p></div>',
  '[{"name":"agency_name","description":"Agency name"},{"name":"traveler_name","description":"Traveler name"},{"name":"trip_name","description":"Trip name"},{"name":"trip_dates","description":"Trip dates"},{"name":"expires_date","description":"Expiry date"}]'::jsonb,
  '{form}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates WHERE slug = 'insurance-waiver-form' AND agency_id IS NULL
);

-- 3. Client Intake Form (channel: form)
INSERT INTO document_templates (slug, name, description, category, channel, form_json, email_html, variables, output_types, status, is_system, is_active, blocks_json)
SELECT
  'client-intake-form',
  'Client Intake Form',
  'Collect new client information — personal details, travel preferences, emergency contacts.',
  'form',
  'form',
  '{"fields":[{"id":"heading_personal","type":"heading","label":"Personal Information"},{"id":"first_name","type":"text","label":"First Name","required":true},{"id":"last_name","type":"text","label":"Last Name","required":true},{"id":"email","type":"email","label":"Email Address","required":true},{"id":"phone","type":"phone","label":"Phone Number"},{"id":"date_of_birth","type":"date","label":"Date of Birth"},{"id":"heading_travel","type":"heading","label":"Travel Preferences"},{"id":"travel_style","type":"select","label":"Travel Style","options":["Luxury","Mid-range","Budget-friendly","Adventure","Family-friendly"]},{"id":"interests","type":"textarea","label":"Travel Interests & Special Requests"},{"id":"passport_country","type":"text","label":"Passport Country"},{"id":"heading_emergency","type":"heading","label":"Emergency Contact"},{"id":"emergency_name","type":"text","label":"Emergency Contact Name"},{"id":"emergency_phone","type":"phone","label":"Emergency Contact Phone"}],"settings":{"submitButtonText":"Submit Information"}}'::jsonb,
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h1 style="color:#c59746;">{{agency_name}}</h1><h2>Welcome! Tell Us About Yourself</h2><p>We are excited to help plan your next adventure.</p>{{{form_fields}}}</div>',
  '[{"name":"agency_name","description":"Agency name"}]'::jsonb,
  '{form}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates WHERE slug = 'client-intake-form' AND agency_id IS NULL
);
