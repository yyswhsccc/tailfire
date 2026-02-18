import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const invite_token = searchParams.get('invite_token')
  const next = searchParams.get('next') ?? '/'

  const supabase = await createClient()

  // Handle PKCE flow (OAuth, magic links)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If invite_token is present, activate the client portal account
      if (invite_token) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'
            await fetch(`${apiUrl}/client-portal/activate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ inviteToken: invite_token }),
            })
          }
        } catch {
          // Activation failure should not block login - user can retry
          console.error('Failed to activate client portal account')
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle token-based flows (invites, recovery)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change',
    })
    if (!error) {
      // If invite_token is present, activate the client portal account
      if (invite_token) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'
            await fetch(`${apiUrl}/client-portal/activate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ inviteToken: invite_token }),
            })
          }
        } catch {
          console.error('Failed to activate client portal account')
        }
      }

      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle hash fragment flows (implicit grants)
  const hash = new URL(request.url).hash
  if (hash && hash.includes('access_token')) {
    return NextResponse.redirect(`${origin}${next}${hash}`)
  }

  // Auth failed, redirect to error page or login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
