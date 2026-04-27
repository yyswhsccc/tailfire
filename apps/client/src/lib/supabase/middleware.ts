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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return { user: null, supabaseResponse }
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
            supabaseResponse.cookies.set(name, value, { ...options, domain: process.env.COOKIE_DOMAIN || undefined })
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

  return { user, supabaseResponse }
}
