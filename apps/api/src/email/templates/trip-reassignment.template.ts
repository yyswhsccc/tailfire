export interface TripReassignmentTemplateParams {
  tripName: string
  adminName: string
  contactsAssigned: number
  tripUrl: string
}

export function getTripReassignmentTemplate({
  tripName,
  adminName,
  contactsAssigned,
  tripUrl,
}: TripReassignmentTemplateParams): string {
  const contactLine = contactsAssigned > 0
    ? `<p style="margin: 0 0 24px; color: #3f3f46; font-size: 14px;">${contactsAssigned} traveler contact${contactsAssigned > 1 ? 's were' : ' was'} also assigned to you.</p>`
    : ''

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Trip Assigned to You</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        ${adminName} has assigned the trip <strong>&quot;${tripName}&quot;</strong> to you.
      </p>
      ${contactLine}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${tripUrl}"
           style="display: inline-block; padding: 14px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Trip
        </a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}
