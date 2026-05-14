/**
 * Sign Out Route
 *
 * Handles user logout by clearing ALL session cookies and redirecting to login.
 * Must explicitly clear cookies on the redirect response — cookies set via
 * cookieStore.set() don't transfer to a NextResponse.redirect().
 */

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = new URL('/auth/login', request.url)
  const response = NextResponse.redirect(url, { status: 302 })

  // Explicitly clear Supabase auth cookies on the redirect response
  // (signOut() sets them via cookieStore which doesn't carry to NextResponse.redirect)
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-') || cookie.name === 'auth_flow') {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }

  return response
}
