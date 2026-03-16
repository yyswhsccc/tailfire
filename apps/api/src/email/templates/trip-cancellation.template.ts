export interface TripCancellationTemplateParams {
  travelerName: string
  tripName: string
  cancellationReason: string | null
  agencyName: string
  agencyPhone?: string
  agencyEmail?: string
}

export function getTripCancellationTemplate(params: TripCancellationTemplateParams): string {
  const { travelerName, tripName, cancellationReason, agencyName, agencyPhone, agencyEmail } = params

  const contactLine = [
    agencyPhone ? `Phone: ${agencyPhone}` : null,
    agencyEmail ? `Email: ${agencyEmail}` : null,
  ].filter(Boolean).join(' | ')

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Trip Cancellation Notice</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        Dear ${travelerName},
      </p>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We regret to inform you that your trip <strong>&ldquo;${tripName}&rdquo;</strong> has been cancelled.
      </p>
      ${cancellationReason ? `
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 0 0 16px;">
        <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
          <strong>Reason:</strong> ${cancellationReason}
        </p>
      </div>
      ` : ''}
      <p style="margin: 0 0 24px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        If you have any questions about this cancellation or would like to discuss alternative arrangements,
        please don't hesitate to contact us.
      </p>
      ${contactLine ? `
      <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin: 0 0 16px;">
        <p style="margin: 0; color: #52525b; font-size: 14px;">
          <strong>${agencyName}</strong><br>
          ${contactLine}
        </p>
      </div>
      ` : ''}
      <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        Thank you for your understanding.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
