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
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Reset Your Password</h2>
      <p style="margin: 0 0 24px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        We received a request to reset your password. Click the button below to create a new password.
        This link will expire in 1 hour.
      </p>
      <a href="${resetLink}"
         style="display: inline-block; padding: 14px 28px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
        Reset Password
      </a>
      <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.5;">
        If you didn't request this password reset, you can safely ignore this email.
        Your password will remain unchanged.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
