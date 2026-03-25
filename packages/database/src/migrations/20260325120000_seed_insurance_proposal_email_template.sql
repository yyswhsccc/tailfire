-- Seed insurance proposal email template
-- Sent to travelers when the agent initiates insurance coverage.
-- Agents can customize this template in Library > Email Templates.

INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "category",
  "variables",
  "is_system"
) VALUES (
  'insurance-proposal',
  'Insurance Proposal',
  'Sent to travelers when the agent initiates insurance coverage. Contains a link to purchase insurance or sign a waiver.',
  'Insurance Coverage — {{trip_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="margin: 0; color: #c59746; font-size: 24px;">{{agency_name}}</h1>
      </div>
      <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Insurance Coverage for Your Trip</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Dear {{traveler_name}},
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        As part of your upcoming trip <strong>{{trip_name}}</strong> ({{trip_dates}}), we want to ensure you have appropriate insurance coverage for your travels.
      </p>
      <p style="margin: 0 0 24px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Please review the available insurance options using the link below. You can choose to purchase coverage or formally decline it.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{waiver_url}}" style="display: inline-block; background-color: #c59746; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">Review Insurance Options</a>
      </div>
      <p style="margin: 0 0 8px; color: #71717a; font-size: 13px; line-height: 1.5;">
        This link will expire on {{expires_date}}. If you have any questions, please contact your travel advisor.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
      <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.5; text-align: center;">
        {{agency_name}} | This is an automated message
      </p>
    </div>
  </div>
</body>
</html>',
  'Dear {{traveler_name}},

As part of your upcoming trip {{trip_name}} ({{trip_dates}}), we want to ensure you have appropriate insurance coverage.

Please review your options: {{waiver_url}}

This link expires on {{expires_date}}.

{{agency_name}}',
  'notification',
  '[
    {"name": "agency_name", "description": "Agency company name"},
    {"name": "traveler_name", "description": "Recipient traveler full name"},
    {"name": "trip_name", "description": "Trip name"},
    {"name": "trip_dates", "description": "Trip date range"},
    {"name": "waiver_url", "description": "Link to insurance waiver form"},
    {"name": "expires_date", "description": "Form expiry date"},
    {"name": "has_dependents", "description": "Whether the form covers dependent minors (true or empty string)"},
    {"name": "dependent_names", "description": "Comma-separated names of dependent travelers"}
  ]'::jsonb,
  true
) ON CONFLICT ("slug") DO NOTHING;
