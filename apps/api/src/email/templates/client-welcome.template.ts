export interface ClientWelcomeTemplateParams {
  firstName: string
  agencyName: string
  agentName?: string
}

export function getClientWelcomeTemplate(params: ClientWelcomeTemplateParams): string {
  const { firstName, agencyName, agentName } = params

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Welcome, ${firstName}!</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Thank you for choosing <strong>${agencyName}</strong> for your travel plans.
        ${agentName ? `Your travel advisor, ${agentName}, will be working with you to create an unforgettable experience.` : 'We look forward to creating an unforgettable travel experience for you.'}
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We'll be in touch soon with more details about your upcoming trip. In the meantime, don't hesitate to reach out if you have any questions.
      </p>
      <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        Warm regards,<br>
        The ${agencyName} Team
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
