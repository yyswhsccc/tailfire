/**
 * Supabase Middleware Client
 *
 * Creates a Supabase client for use in Next.js middleware.
 * Handles cookie management for session refresh.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and supabase.auth.getUser()
  // A simple mistake could make it very hard to debug session issues.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Extract user_status and aal from JWT claims
  let userStatus: string | null = null
  let aal: 'aal1' | 'aal2' | null = null
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    try {
      const parts = session.access_token.split('.')
      if (parts[1]) {
        const claims = JSON.parse(atob(parts[1]))
        userStatus = claims.user_status ?? null
        aal = claims.aal ?? null
      }
    } catch { /* ignore decode errors */ }
  }

  // Use the fresh user object from getUser() for factor detection.
  // getAuthenticatorAssuranceLevel() without an explicit JWT reads the cached
  // session user/factors, which can be stale after factor deletion or MFA verify.
  const hasMfaFactors =
    (user?.factors ?? []).some((factor) => factor.status === 'verified')

  return { user, userStatus, aal, hasMfaFactors, supabaseResponse }
}
