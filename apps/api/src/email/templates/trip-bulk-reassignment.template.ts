export interface TripBulkReassignmentTemplateParams {
  adminName: string
  tripCount: number
  tripNames: string[]
  contactsAssigned: number
  contactsSkipped: number
  tripsUrl: string
}

export function getTripBulkReassignmentTemplate({
  adminName,
  tripCount,
  tripNames,
  contactsAssigned,
  contactsSkipped,
  tripsUrl,
}: TripBulkReassignmentTemplateParams): string {
  const tripList = tripNames.slice(0, 10).map(n => `<li style="margin: 4px 0; color: #3f3f46;">${n}</li>`).join('')
  const moreTrips = tripCount > 10 ? `<li style="margin: 4px 0; color: #71717a;">...and ${tripCount - 10} more</li>` : ''

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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">${tripCount} Trips Assigned to You</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        ${adminName} has assigned ${tripCount} trip${tripCount > 1 ? 's' : ''} to you.
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px;">
        ${tripList}
        ${moreTrips}
      </ul>
      <p style="margin: 0 0 8px; color: #3f3f46; font-size: 14px;">
        <strong>${contactsAssigned}</strong> traveler contact${contactsAssigned !== 1 ? 's were' : ' was'} assigned to you.
      </p>
      ${contactsSkipped > 0 ? `<p style="margin: 0 0 16px; color: #71717a; font-size: 13px;">${contactsSkipped} contact${contactsSkipped !== 1 ? 's were' : ' was'} unchanged (owned by other active agents).</p>` : ''}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${tripsUrl}"
           style="display: inline-block; padding: 14px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Your Trips
        </a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}
