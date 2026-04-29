/**
 * Auth Callback Route
 *
 * Handles OAuth, magic link, and invite callbacks from Supabase Auth.
 * - PKCE flows (OAuth, magic link): Exchange `code` for session (server-side)
 * - Token flows (invite, recovery): Verify OTP with `token_hash`/`token` (server-side)
 * - Hash fragment flows (implicit): Returns HTML page for client-side handling
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const supabase = await createClient()
  const next = searchParams.get('next') ?? '/trips'

  // Handle PKCE-based flows (OAuth, magic link)
  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`)
  }

  // Handle invite/recovery token-based flows (query params)
  // Note: Supabase may use 'token_hash' or 'token' depending on SDK version
  const token_hash = searchParams.get('token_hash') || searchParams.get('token')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'invite' | 'recovery' | 'email',
    })

    if (!error) {
      // For invites, redirect to set-password (user stays pending until password is set)
      if (type === 'invite') {
        // No activation here — user stays pending until password is set.
        // Activation happens on recordLogin() after successful authentication.
        return NextResponse.redirect(`${origin}/auth/set-password`)
      }
      // For recovery, redirect to password reset
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/auth/reset-password`)
      }
      // Default redirect
      return NextResponse.redirect(`${origin}/trips`)
    }
    return NextResponse.redirect(`${origin}/auth/login?error=token_invalid`)
  }

  // No query params = likely hash fragment flow (implicit/invite with tokens in hash)
  // Return HTML page that handles hash fragments client-side
  // Hash fragments are NOT sent to server, so we serve a client-side handler
  return new NextResponse(getHashHandlerHtml(origin, next), {
    headers: {
      'Content-Type': 'text/html',
      // Prevent caching of auth callback - security sensitive
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

/**
 * Returns HTML that handles hash fragment authentication client-side.
 * This is necessary because URL hash fragments are never sent to the server.
 *
 * NOTE: If CSP is enforced, this page needs 'unsafe-inline' for scripts,
 * or refactor to use an external script with a nonce/hash.
 */
function getHashHandlerHtml(origin: string, next: string): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Completing authentication...</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f4f4f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid #e4e4e7;
      border-top-color: #0d9488;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .message {
      color: #71717a;
      font-size: 0.875rem;
    }
    .error {
      color: #dc2626;
      margin-top: 1rem;
    }
    .error a {
      color: #0d9488;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p class="message">Completing authentication...</p>
    <p class="error" id="error" style="display: none;"></p>
  </div>
  <script type="module">
    import { createBrowserClient } from 'https://esm.sh/@supabase/ssr@0.10.2'

    const origin = '${origin}'
    const next = '${next}'
    const supabase = createBrowserClient('${supabaseUrl}', '${supabaseAnonKey}')

    async function handleCallback() {
      const hash = window.location.hash
      if (!hash || hash === '#') {
        // No hash = redirect to login with error
        window.location.href = origin + '/auth/login?error=missing_params'
        return
      }

      try {
        const hashParams = new URLSearchParams(hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        if (accessToken && refreshToken) {
          // Set session with tokens from hash
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            console.error('Session error:', sessionError)
            window.location.href = origin + '/auth/login?error=session_failed'
            return
          }

          // Redirect based on flow type
          // Invite/signup users go to set-password (stay pending until password is set)
          if (type === 'invite' || type === 'signup') {
            window.location.href = origin + '/auth/set-password'
          } else if (type === 'recovery') {
            window.location.href = origin + '/auth/reset-password'
          } else {
            window.location.href = origin + next
          }
        } else {
          window.location.href = origin + '/auth/login?error=invalid_callback'
        }
      } catch (err) {
        console.error('Callback error:', err)
        document.getElementById('error').style.display = 'block'
        document.getElementById('error').innerHTML =
          'Authentication failed. <a href="' + origin + '/auth/login">Return to login</a>'
      }
    }

    handleCallback()
  </script>
</body>
</html>`
}
