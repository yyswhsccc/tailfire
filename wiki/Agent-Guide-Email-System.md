# Agent Guide: Email System

Tailfire’s email tooling has multiple parts. This page explains the difference between them and how agents should use each one.

## 1. Your Connected Email Account

Location:

- `Profile > Email`

This is where an agent connects their own mailbox for sending and receiving email inside Tailfire.

Current setup supports:

- email address
- display name
- IMAP incoming settings
- SMTP outgoing settings
- connection testing
- edit and remove actions

Use this area when:

- you are setting up your mailbox for the first time
- your password changed
- your inbox is showing authentication errors

## 2. The Inbox

Location:

- `Emails > Inbox`

This is the day-to-day workspace for reading and sending email inside the platform.

Current inbox features include:

- folder sidebar
- sync action
- search
- sorting
- reading pane
- compose dialog
- drag-and-drop email moves between folders

If you do not have an email account configured, the inbox points you back to `Profile > Email`.

## 3. Agency Email Settings

Location:

- `Settings > Email`

This is more of an operations/admin area than a daily advisor tool.

Current settings include:

- allowed email domains for connected accounts
- a compliance footer appended to outbound CRM email

## 4. Email Templates For Notifications

Location:

- `Library > Notifications`

This area is for automation and notification templates, not your inbox.

Current actions include:

- browse templates
- filter by category and status
- preview rendered content
- send a test email
- activate or deactivate templates

## 5. Document Templates With Email Output

Location:

- `Library > Templates`

This is separate from notification templates. It manages broader document-template content, including an email category alongside trip order, payment, and proposal templates.

## Common Scenarios

### I want to read or reply to client email

Use:

- `Emails > Inbox`

### I want to connect my mailbox

Use:

- `Profile > Email`

### I want to preview or test an automation email

Use:

- `Library > Notifications`

### I need to update agency-wide email guardrails

Use:

- `Settings > Email`

## Common Issues

### Authentication Failed

If you see an IMAP authentication error, update your credentials under:

- `Profile > Email`

### My Domain Is Blocked

If your mailbox domain is not accepted, the agency’s allowed-domain settings may need to be updated in:

- `Settings > Email`

### I Can’t Find The Right Template

Check whether you need:

- an inbox/mailbox workflow
- a notification template
- a document template

Those are three different parts of the platform.

## Related Articles

- [Template System](./Agent-Guide-Template-System.md)
- [Libraries](./Agent-Guide-Libraries.md)
