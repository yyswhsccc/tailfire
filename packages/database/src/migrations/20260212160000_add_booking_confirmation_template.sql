-- ==============================================================================
-- Migration: Add Booking Confirmation Email Template
-- ==============================================================================
-- Agent-triggered booking confirmation email sent to clients when a trip is booked.
-- ==============================================================================

-- Booking Confirmation Email Template
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
  'booking-confirmation',
  'Booking Confirmation',
  'Sent by agent when a trip is confirmed/booked',
  'Booking Confirmed: {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Booking Confirmed!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your trip has been successfully booked</p>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>

    <p>Great news! Your trip has been confirmed and all bookings are in place. We are excited to help make your travel dreams a reality!</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #c59746; margin-top: 0; font-size: 18px;">Trip Details</h2>
      <p><strong>Trip Name:</strong> {{trip.name}}</p>
      <p><strong>Reference:</strong> {{trip.reference}}</p>
      <p><strong>Travel Dates:</strong> {{trip.start_date}}{{trip.end_date:: - }}{{trip.end_date}}</p>
      <p><strong>Destination:</strong> {{trip.destination}}</p>
    </div>

    <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #c59746;">
      <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">What Happens Next?</h3>
      <ul style="color: #92400e; margin-bottom: 0; padding-left: 20px;">
        <li>You will receive your complete Trip Order document shortly</li>
        <li>Review your payment schedule and due dates</li>
        <li>Reach out if you have any questions or special requests</li>
      </ul>
    </div>

    <p>Your dedicated travel advisor is here to assist you every step of the way. If you have any questions or need to make changes, please don''t hesitate to reach out.</p>

    <p>Thank you for choosing us for your travel plans!</p>

    <p>Warm regards,<br>
    <strong style="color: #c59746;">{{agent.name::Your Travel Advisor}}</strong><br>
    {{business.name::Phoenix Voyages}}</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
    {{business.tico_registration::<p>TICO Registration: }}{{business.tico_registration}}{{business.tico_registration::</p>}}
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Great news! Your trip has been confirmed and all bookings are in place.

TRIP DETAILS
------------
Trip Name: {{trip.name}}
Reference: {{trip.reference}}
Travel Dates: {{trip.start_date}} - {{trip.end_date}}
Destination: {{trip.destination}}

WHAT HAPPENS NEXT
-----------------
- You will receive your complete Trip Order document shortly
- Review your payment schedule and due dates
- Reach out if you have any questions or special requests

Your dedicated travel advisor is here to assist you every step of the way.

Thank you for choosing us for your travel plans!

Warm regards,
{{agent.name::Your Travel Advisor}}
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "contact.last_name", "description": "Contact last name"},
    {"key": "contact.email", "description": "Contact email address"},
    {"key": "trip.name", "description": "Trip name"},
    {"key": "trip.reference", "description": "Trip reference number"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "trip.destination", "description": "Trip destination"},
    {"key": "agent.name", "description": "Travel advisor name", "defaultValue": "Your Travel Advisor"},
    {"key": "agent.email", "description": "Travel advisor email"},
    {"key": "agent.phone", "description": "Travel advisor phone"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"},
    {"key": "business.tico_registration", "description": "TICO registration number"}
  ]'::jsonb,
  'notification',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;
