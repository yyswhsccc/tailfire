export interface ClientPortalInviteTemplateParams {
  inviteLink: string
  firstName: string
  agentName?: string
}

export function getClientPortalInviteTemplate({
  inviteLink,
  firstName,
  agentName,
}: ClientPortalInviteTemplateParams): string {
  const agentText = agentName
    ? `${agentName} has set up`
    : 'We have set up'

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Access Your Travel Portal</h2>
      <p style="margin: 0 0 24px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Hi ${firstName},<br><br>
        ${agentText} your personal travel portal where you can view your trips, itineraries, and travel documents all in one place.
      </p>
      <a href="${inviteLink}"
         style="display: inline-block; padding: 14px 28px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
        Access Your Portal
      </a>
      <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        This link will expire in 24 hours. After your first login, you can request a new login link anytime from the portal login page.
      </p>
    </div>
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      Phoenix Voyages
    </p>
  </div>
</body>
</html>
  `.trim()
}
