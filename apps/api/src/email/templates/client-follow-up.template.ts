export interface ClientFollowUpTemplateParams {
  firstName: string
  tripName?: string
  agencyName: string
}

export function getClientFollowUpTemplate(params: ClientFollowUpTemplateParams): string {
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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Just checking in, ${firstName}</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        ${tripName
          ? `We wanted to follow up regarding your trip <strong>&ldquo;${tripName}&rdquo;</strong>. Have you had a chance to review the details?`
          : 'We wanted to touch base and see if you have any questions about your travel plans.'}
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We're here to help with any questions or adjustments you might need. Just reply to this email and we'll get back to you promptly.
      </p>
      <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        Best regards,<br>
        The ${agencyName} Team
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
