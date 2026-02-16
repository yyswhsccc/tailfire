-- Seed email template for task due reminder notifications
-- Sent to contacts 24 hours before a task is due

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
  'task-due-reminder',
  'Task Due Reminder',
  'Reminder sent to contacts 24 hours before a task is due',
  'Reminder: {{task_title}} is due tomorrow',
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
              <h1 style="margin:0;color:#ffffff;font-size:24px;">Task Due Reminder</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#27272a;">Hi {{contact.first_name}},</p>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;">This is a friendly reminder that the following task is due tomorrow:</p>

              <table width="100%" cellpadding="12" cellspacing="0" style="margin-bottom:24px;border:1px solid #e4e4e7;border-radius:4px;background-color:#fafafa;">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:#27272a;">{{task_title}}</p>
                    <p style="margin:0;font-size:14px;color:#71717a;">Due: {{task_due_date}}</p>
                  </td>
                </tr>
              </table>

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

This is a friendly reminder that the following task is due tomorrow:

Task: {{task_title}}
Due: {{task_due_date}}

If you have any questions, please contact your travel advisor.

{{business.name}}',
  'notification',
  '[
    {"name": "contact.first_name", "description": "Contact first name", "defaultValue": "there"},
    {"name": "task_title", "description": "Title of the task due tomorrow"},
    {"name": "task_due_date", "description": "Due date of the task"},
    {"name": "business.name", "description": "Agency business name", "defaultValue": "Your Travel Agency"}
  ]'::jsonb,
  true
) ON CONFLICT ("slug") DO NOTHING;
