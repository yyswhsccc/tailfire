-- Seed email template for task assignment digest notifications
-- Sent hourly to contacts with new/removed task assignments

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
  'task-assignment-digest',
  'Task Assignment Digest',
  'Hourly digest of new and removed task assignments sent to contacts',
  'Your Task Assignments Update',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#c59746,#e89e4a);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;">Task Assignments Update</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#27272a;">Hi {{contact.first_name}},</p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;">Here is a summary of your recent task assignment changes:</p>

              {{assigned_tasks_html}}

              {{removed_tasks_html}}

              <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;">If you have any questions, please contact your travel advisor.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">&copy; {{business.name}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  'Hi {{contact.first_name}},

Here is a summary of your recent task assignment changes:

{{assigned_tasks_text}}

{{removed_tasks_text}}

If you have any questions, please contact your travel advisor.

{{business.name}}',
  'notification',
  '[
    {"name": "contact.first_name", "description": "Contact first name", "defaultValue": "there"},
    {"name": "assigned_tasks_html", "description": "Pre-rendered HTML for newly assigned tasks"},
    {"name": "assigned_tasks_text", "description": "Pre-rendered text for newly assigned tasks"},
    {"name": "removed_tasks_html", "description": "Pre-rendered HTML for removed task assignments"},
    {"name": "removed_tasks_text", "description": "Pre-rendered text for removed task assignments"},
    {"name": "business.name", "description": "Agency business name", "defaultValue": "Your Travel Agency"}
  ]'::jsonb,
  true
) ON CONFLICT ("slug") DO NOTHING;
