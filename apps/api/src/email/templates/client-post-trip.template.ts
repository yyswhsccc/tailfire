export interface ClientPostTripTemplateParams {
  firstName: string
  tripName: string
  agencyName: string
}

export function getClientPostTripTemplate(params: ClientPostTripTemplateParams): string {
  const { firstName, tripName, agencyName } = params

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Welcome back, ${firstName}!</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We hope you had a wonderful time on your trip <strong>&ldquo;${tripName}&rdquo;</strong>!
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We'd love to hear about your experience. Your feedback helps us continue to improve and plan even better trips in the future.
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        When you're ready to start planning your next adventure, we're here to help!
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
