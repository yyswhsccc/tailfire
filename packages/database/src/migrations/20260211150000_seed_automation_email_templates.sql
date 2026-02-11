-- ==============================================================================
-- Migration: Seed Automation Email Templates
-- ==============================================================================
-- Seeds email templates for the automation system:
-- - Payment reminders (7 days, 3 days, due date, 1 day overdue)
-- - Departure reminders (30 days, 14 days, 7 days, 1 day)
-- - Post-trip emails (thank you, feedback request)
-- - Client care (birthday)
--
-- Prerequisites: 20260211145959_add_email_category_enum_values.sql
-- ==============================================================================

-- Payment Reminder: 7 Days Before
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'payment-reminder-7-days-before',
  'Payment Reminder - 7 Days',
  'Sent 7 days before a payment is due',
  'Payment Reminder: {{payment.name}} due in 7 days',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Payment Reminder</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>This is a friendly reminder that your payment is due in <strong>7 days</strong>.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #1a365d; margin-top: 0;">Payment Details</h2>
      <p><strong>Trip:</strong> {{trip.name}}</p>
      <p><strong>Payment:</strong> {{payment.name}}</p>
      <p><strong>Amount Due:</strong> {{payment.amount}}</p>
      <p><strong>Due Date:</strong> {{payment.due_date}}</p>
    </div>

    <p>Please ensure your payment is submitted on time to avoid any disruption to your travel plans.</p>

    <p>If you have already made this payment, please disregard this notice.</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

This is a friendly reminder that your payment is due in 7 days.

Payment Details:
- Trip: {{trip.name}}
- Payment: {{payment.name}}
- Amount Due: {{payment.amount}}
- Due Date: {{payment.due_date}}

Please ensure your payment is submitted on time to avoid any disruption to your travel plans.

If you have already made this payment, please disregard this notice.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "payment.name", "description": "Payment item name"},
    {"key": "payment.amount", "description": "Payment amount due"},
    {"key": "payment.due_date", "description": "Payment due date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'payment',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Payment Reminder: 3 Days Before
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'payment-reminder-3-days-before',
  'Payment Reminder - 3 Days',
  'Sent 3 days before a payment is due',
  'Payment Reminder: {{payment.name}} due in 3 days',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #d97706; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Payment Due Soon</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your payment is due in <strong>3 days</strong>. Please ensure timely payment to secure your booking.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #fbbf24;">
      <h2 style="color: #d97706; margin-top: 0;">Payment Details</h2>
      <p><strong>Trip:</strong> {{trip.name}}</p>
      <p><strong>Payment:</strong> {{payment.name}}</p>
      <p><strong>Amount Due:</strong> {{payment.amount}}</p>
      <p><strong>Due Date:</strong> {{payment.due_date}}</p>
    </div>

    <p>If you have already made this payment, please disregard this notice.</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your payment is due in 3 days. Please ensure timely payment to secure your booking.

Payment Details:
- Trip: {{trip.name}}
- Payment: {{payment.name}}
- Amount Due: {{payment.amount}}
- Due Date: {{payment.due_date}}

If you have already made this payment, please disregard this notice.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "payment.name", "description": "Payment item name"},
    {"key": "payment.amount", "description": "Payment amount due"},
    {"key": "payment.due_date", "description": "Payment due date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'payment',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Payment Reminder: Due Date
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'payment-reminder-due-date',
  'Payment Reminder - Due Today',
  'Sent on the payment due date',
  'Payment Due Today: {{payment.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dc2626; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Payment Due Today</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your payment is <strong>due today</strong>. Please submit your payment immediately to maintain your booking.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 2px solid #dc2626;">
      <h2 style="color: #dc2626; margin-top: 0;">Payment Details</h2>
      <p><strong>Trip:</strong> {{trip.name}}</p>
      <p><strong>Payment:</strong> {{payment.name}}</p>
      <p><strong>Amount Due:</strong> {{payment.amount}}</p>
      <p><strong>Due Date:</strong> {{payment.due_date}}</p>
    </div>

    <p>If you have already made this payment, please disregard this notice.</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your payment is due today. Please submit your payment immediately to maintain your booking.

Payment Details:
- Trip: {{trip.name}}
- Payment: {{payment.name}}
- Amount Due: {{payment.amount}}
- Due Date: {{payment.due_date}}

If you have already made this payment, please disregard this notice.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "payment.name", "description": "Payment item name"},
    {"key": "payment.amount", "description": "Payment amount due"},
    {"key": "payment.due_date", "description": "Payment due date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'payment',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Payment Reminder: 1 Day Overdue
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'payment-reminder-1-day-overdue',
  'Payment Reminder - Overdue',
  'Sent 1 day after payment due date',
  'OVERDUE: Payment for {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #991b1b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Payment Overdue</h1>
  </div>

  <div style="padding: 30px; background-color: #fef2f2; border: 1px solid #fecaca; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your payment is now <strong>overdue</strong>. Please submit payment immediately to avoid any issues with your booking.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 2px solid #991b1b;">
      <h2 style="color: #991b1b; margin-top: 0;">Payment Details</h2>
      <p><strong>Trip:</strong> {{trip.name}}</p>
      <p><strong>Payment:</strong> {{payment.name}}</p>
      <p><strong>Amount Due:</strong> {{payment.amount}}</p>
      <p><strong>Was Due:</strong> {{payment.due_date}}</p>
    </div>

    <p>Please contact us immediately if you are experiencing any difficulties with your payment.</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your payment is now OVERDUE. Please submit payment immediately to avoid any issues with your booking.

Payment Details:
- Trip: {{trip.name}}
- Payment: {{payment.name}}
- Amount Due: {{payment.amount}}
- Was Due: {{payment.due_date}}

Please contact us immediately if you are experiencing any difficulties with your payment.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "payment.name", "description": "Payment item name"},
    {"key": "payment.amount", "description": "Payment amount due"},
    {"key": "payment.due_date", "description": "Payment due date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'payment',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Departure Reminder: 30 Days
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'departure-reminder-30-days',
  'Departure Reminder - 30 Days',
  'Sent 30 days before trip departure',
  'Your Trip is 30 Days Away! - {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">30 Days to Go!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your trip <strong>{{trip.name}}</strong> is just <strong>30 days away</strong>! We''re as excited as you are.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #1a365d; margin-top: 0;">Trip Details</h2>
      <p><strong>Departure:</strong> {{trip.start_date}}</p>
      <p><strong>Return:</strong> {{trip.end_date}}</p>
    </div>

    <p><strong>Things to check:</strong></p>
    <ul>
      <li>Ensure your passport is valid for at least 6 months after your return date</li>
      <li>Review your travel insurance coverage</li>
      <li>Check visa requirements for your destination</li>
      <li>Start making a packing list</li>
    </ul>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your trip {{trip.name}} is just 30 days away! We''re as excited as you are.

Trip Details:
- Departure: {{trip.start_date}}
- Return: {{trip.end_date}}

Things to check:
- Ensure your passport is valid for at least 6 months after your return date
- Review your travel insurance coverage
- Check visa requirements for your destination
- Start making a packing list

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Departure Reminder: 14 Days
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'departure-reminder-14-days',
  'Departure Reminder - 14 Days',
  'Sent 14 days before trip departure',
  '2 Weeks Until Your Trip! - {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">2 Weeks to Go!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your trip <strong>{{trip.name}}</strong> is just <strong>2 weeks away</strong>!</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #1a365d; margin-top: 0;">Trip Details</h2>
      <p><strong>Departure:</strong> {{trip.start_date}}</p>
      <p><strong>Return:</strong> {{trip.end_date}}</p>
    </div>

    <p><strong>Final preparations:</strong></p>
    <ul>
      <li>Confirm all reservations and bookings</li>
      <li>Arrange airport transportation</li>
      <li>Notify your bank of your travel dates</li>
      <li>Download any necessary apps or maps for offline use</li>
    </ul>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your trip {{trip.name}} is just 2 weeks away!

Trip Details:
- Departure: {{trip.start_date}}
- Return: {{trip.end_date}}

Final preparations:
- Confirm all reservations and bookings
- Arrange airport transportation
- Notify your bank of your travel dates
- Download any necessary apps or maps for offline use

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Departure Reminder: 7 Days
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'departure-reminder-7-days',
  'Departure Reminder - 7 Days',
  'Sent 7 days before trip departure',
  'One Week Until Your Adventure! - {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #059669; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">1 Week to Go!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your trip <strong>{{trip.name}}</strong> is just <strong>one week away</strong>! The countdown is on!</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #059669; margin-top: 0;">Trip Details</h2>
      <p><strong>Departure:</strong> {{trip.start_date}}</p>
      <p><strong>Return:</strong> {{trip.end_date}}</p>
    </div>

    <p><strong>Last-minute checklist:</strong></p>
    <ul>
      <li>Print or save all travel documents</li>
      <li>Check the weather forecast for your destination</li>
      <li>Charge all your devices</li>
      <li>Pack your bags (don''t forget chargers and adapters!)</li>
    </ul>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your trip {{trip.name}} is just one week away! The countdown is on!

Trip Details:
- Departure: {{trip.start_date}}
- Return: {{trip.end_date}}

Last-minute checklist:
- Print or save all travel documents
- Check the weather forecast for your destination
- Charge all your devices
- Pack your bags (don''t forget chargers and adapters!)

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Departure Reminder: 1 Day
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'departure-reminder-1-day',
  'Departure Reminder - Tomorrow',
  'Sent 1 day before trip departure',
  'You Leave Tomorrow! - {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #7c3aed; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Tomorrow is the Day!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Your adventure <strong>{{trip.name}}</strong> starts <strong>tomorrow</strong>! We hope you''re ready for an amazing experience.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #7c3aed; margin-top: 0;">Departure Day</h2>
      <p><strong>Date:</strong> {{trip.start_date}}</p>
    </div>

    <p><strong>Final reminders:</strong></p>
    <ul>
      <li>Double-check your passport and travel documents</li>
      <li>Set your alarms and allow plenty of time to get to the airport</li>
      <li>Have your travel insurance details handy</li>
      <li>Most importantly - get a good night''s rest!</li>
    </ul>

    <p>Have a wonderful trip! We''re here if you need anything.</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your adventure {{trip.name}} starts tomorrow! We hope you''re ready for an amazing experience.

Departure Day: {{trip.start_date}}

Final reminders:
- Double-check your passport and travel documents
- Set your alarms and allow plenty of time to get to the airport
- Have your travel insurance details handy
- Most importantly - get a good night''s rest!

Have a wonderful trip! We''re here if you need anything.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Post-Trip: Thank You
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'post-trip-thank-you',
  'Post-Trip Thank You',
  'Sent 1 day after trip completion',
  'Welcome Back! Thank You for Traveling with Us',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Welcome Back!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Welcome home! We hope you had an incredible time on your trip <strong>{{trip.name}}</strong>.</p>

    <p>Thank you for choosing {{business.name::Phoenix Voyages}} for your travel needs. It was our pleasure to help plan your adventure, and we hope it exceeded your expectations.</p>

    <p>We''d love to hear about your experience! If you have any photos or stories to share, feel free to reach out or tag us on social media.</p>

    <p>Until your next adventure,<br>
    The {{business.name::Phoenix Voyages}} Team</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Welcome home! We hope you had an incredible time on your trip {{trip.name}}.

Thank you for choosing {{business.name::Phoenix Voyages}} for your travel needs. It was our pleasure to help plan your adventure, and we hope it exceeded your expectations.

We''d love to hear about your experience! If you have any photos or stories to share, feel free to reach out or tag us on social media.

Until your next adventure,
The {{business.name::Phoenix Voyages}} Team

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'client_care',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Post-Trip: Feedback Request
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'post-trip-feedback-request',
  'Post-Trip Feedback Request',
  'Sent 2 days after trip completion',
  'How Was Your Trip? We''d Love Your Feedback!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Share Your Experience</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>We hope you''re still basking in the wonderful memories from <strong>{{trip.name}}</strong>!</p>

    <p>Your feedback is incredibly valuable to us. It helps us improve our services and ensures we continue to create amazing travel experiences.</p>

    <p>Would you mind taking a few minutes to share your thoughts about your trip? We''d love to know:</p>
    <ul>
      <li>What was the highlight of your trip?</li>
      <li>Was there anything we could have done better?</li>
      <li>Would you recommend us to friends and family?</li>
    </ul>

    <p>Simply reply to this email with your feedback, or feel free to give us a call.</p>

    <p>Thank you for being a valued client!</p>

    <p>Best regards,<br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

We hope you''re still basking in the wonderful memories from {{trip.name}}!

Your feedback is incredibly valuable to us. It helps us improve our services and ensures we continue to create amazing travel experiences.

Would you mind taking a few minutes to share your thoughts about your trip? We''d love to know:
- What was the highlight of your trip?
- Was there anything we could have done better?
- Would you recommend us to friends and family?

Simply reply to this email with your feedback, or feel free to give us a call.

Thank you for being a valued client!

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'client_care',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Client Birthday
INSERT INTO "email_templates" (
  "slug",
  "name",
  "description",
  "subject",
  "body_html",
  "body_text",
  "variables",
  "category",
  "is_system",
  "is_active"
) VALUES (
  'client-birthday',
  'Client Birthday',
  'Sent on client birthday',
  'Happy Birthday, {{contact.first_name}}! 🎉',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #7c3aed; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Happy Birthday!</h1>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p style="font-size: 18px;">Wishing you a wonderful birthday filled with joy, laughter, and adventure!</p>

    <p>From all of us at {{business.name::Phoenix Voyages}}, we hope your special day is everything you''ve dreamed of.</p>

    <p>May the year ahead bring you exciting new destinations to explore and beautiful memories to cherish.</p>

    <p>Here''s to another year of incredible journeys!</p>

    <p>Warmest wishes,<br>
    The {{business.name::Phoenix Voyages}} Team</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Wishing you a wonderful birthday filled with joy, laughter, and adventure!

From all of us at {{business.name::Phoenix Voyages}}, we hope your special day is everything you''ve dreamed of.

May the year ahead bring you exciting new destinations to explore and beautiful memories to cherish.

Here''s to another year of incredible journeys!

Warmest wishes,
The {{business.name::Phoenix Voyages}} Team

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'client_care',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;
