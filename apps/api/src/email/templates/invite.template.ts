export interface InviteTemplateParams {
  inviteLink: string
  firstName: string
  inviterName?: string
}

export function getInviteTemplate({
  inviteLink,
  firstName,
  inviterName,
}: InviteTemplateParams): string {
  const inviterText = inviterName
    ? `${inviterName} has invited you`
    : 'You have been invited'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Welcome to Phoenix Voyages</h2>
      <p style="margin: 0 0 24px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Hi ${firstName},<br><br>
        ${inviterText} to join the Phoenix Voyages team. Click the button below to set up your account.
      </p>
      <a href="${inviteLink}"
         style="display: inline-block; padding: 14px 28px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
        Accept Invitation
      </a>
      <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        This invitation link will expire in 24 hours. If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
