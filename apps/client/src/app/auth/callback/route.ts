import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

async function activatePortalAccount(supabase: SupabaseClient) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'
      await fetch(`${apiUrl}/portal/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {}) // Non-blocking, ignore errors
    }
  } catch {
    // Non-blocking activation — don't fail the auth callback
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  // Handle PKCE flow (OAuth, magic links)
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Fire portal activation (non-blocking)
      await activatePortalAccount(supabase)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle token-based flows (invites, recovery)
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change',
    })
    if (!error) {
      // For password recovery, redirect to reset password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      // Fire portal activation (non-blocking)
      await activatePortalAccount(supabase)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle hash fragment flows (implicit grants)
  // These are handled client-side, redirect to let client handle
  const hash = new URL(request.url).hash
  if (hash && hash.includes('access_token')) {
    return NextResponse.redirect(`${origin}${next}${hash}`)
  }

  // Auth failed, redirect to error page or login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
