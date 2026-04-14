/**
 * Sign Out Route
 *
 * Handles user logout by clearing the session and redirecting to login.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = new URL('/auth/login', request.url)
  const response = NextResponse.redirect(url, { status: 302 })

  // Clear restricted auth flow cookie (recovery/invite_setup) on signout
  response.cookies.delete('auth_flow')

  return response
}
