export interface PasswordResetTemplateParams {
  resetLink: string
}

export function getPasswordResetTemplate({ resetLink }: PasswordResetTemplateParams): string {
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
      <!-- Logo / Brand -->
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="margin: 0; color: #ea580c; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">PHOENIX VOYAGES</h1>
      </div>

      <h2 style="margin: 0 0 16px; color: #18181b; font-size: 22px; font-weight: 600;">Reset Your Password</h2>
      <p style="margin: 0 0 32px; color: #3f3f46; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to create a new password.
        This link will expire in 1 hour.
      </p>

      <!-- Bulletproof Button (works in all email clients) -->
      <div style="text-align: center; margin: 32px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetLink}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="12%" strokecolor="#ea580c" fillcolor="#ea580c">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">Reset Password</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
          <tr>
            <td align="center" bgcolor="#ea580c" style="border-radius: 8px;">
              <a href="${resetLink}" target="_blank"
                 style="display: inline-block; padding: 16px 48px; color: #ffffff; background-color: #ea580c; font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; text-decoration: none; border-radius: 8px; line-height: 1; letter-spacing: 0.3px;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </div>

      <p style="margin: 32px 0 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        If you didn't request this password reset, you can safely ignore this email.
        Your password will remain unchanged.
      </p>

      <!-- Divider -->
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0 16px;" />
      <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
        Phoenix Voyages &mdash; Travel Agency Management
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
