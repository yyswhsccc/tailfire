# Agent Guide: Email Troubleshooting

This article covers the most common email setup and inbox issues agents are likely to hit.

## No Email Account Configured

If the inbox says no email account is configured:

1. Go to `Profile > Email`.
2. Add your email address and display name.
3. Enter the IMAP and SMTP host settings.
4. Enter the mailbox username and password.
5. Test the connection.
6. Save the account.

Tailfire currently points users to `Profile > Email` when no account exists.

## Connection Test Fails

If the test connection action fails, verify:

- IMAP host and port
- IMAP TLS setting
- SMTP host and port
- SMTP TLS setting
- mailbox username
- current mailbox password

Use the `Test Connection` action before saving whenever you change server or credential settings.

## Inbox Shows Authentication Failed

If the inbox shows an authentication warning:

1. Go back to `Profile > Email`.
2. Edit the account.
3. Re-enter the correct credentials.
4. Save the account.
5. Return to the inbox and run a sync.

The current inbox specifically warns that the mailbox password may have changed.

## Not Seeing New Emails

Check these first:

- click the inbox `Sync` action
- make sure you are in the correct folder
- clear any search text that may be filtering results
- review the sort mode if you expect the newest mail at the top

The current inbox uses the first connected email account as the active account.

## Wrong Display Name Or Outgoing Settings

If sent emails show the wrong identity details:

1. Go to `Profile > Email`.
2. Edit the account.
3. Update the display name and outgoing server settings.
4. Save the changes.

## Domain Rules Or Compliance Footer Issues

If mail sending is blocked by agency rules or if footer content looks wrong:

- review `Settings > Email` with an admin
- verify the allowed sending domains
- verify the compliance footer content

These settings are agency-managed, not personal inbox settings.

## Template Confusion

Tailfire has more than one email-related area:

- `Emails` is your live inbox and compose area.
- `Library > Notifications` is the email template library used for automations and testing.
- `Library > Templates` is for document-style templates, not your mailbox.

## Current Limitations To Remember

- SMS templates are present in the library UI but not active yet.
- If you connect multiple accounts, the inbox currently defaults to the first one returned to the UI.

## Related Articles

- [Email System](./Agent-Guide-Email-System.md)
- [Service Fees](./Agent-Guide-Service-Fees.md)
- [Libraries](./Agent-Guide-Libraries.md)
