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
  const error_param = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/'

  // Handle error redirects from Supabase (e.g. expired OTP)
  if (error_param) {
    console.error('[auth/callback] Supabase error redirect:', error_param, error_description)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description || error_param)}`)
  }

  // Handle PKCE flow (OAuth, magic links via Supabase verify redirect)
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await activatePortalAccount(supabase)
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] Code exchange failed:', error.message, error.code)
    // Don't fall through — code was already consumed
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Handle token-based flows (invites, recovery, magic links)
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change',
    })
    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      await activatePortalAccount(supabase)
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] OTP verification failed:', error.message, error.code)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Handle hash fragment flows (implicit grants)
  const hash = new URL(request.url).hash
  if (hash && hash.includes('access_token')) {
    return NextResponse.redirect(`${origin}${next}${hash}`)
  }

  // No auth params provided
  console.error('[auth/callback] No auth params provided:', searchParams.toString())
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
