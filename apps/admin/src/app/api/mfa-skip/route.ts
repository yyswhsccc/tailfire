/**
 * MFA Skip API Route
 *
 * Sets an httpOnly grace cookie when a user skips MFA enrollment.
 * This prevents the client from forging the grace timestamp.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MFA_GRACE_DAYS = 7

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })

  response.cookies.set('mfa_skipped_at', String(Date.now()), {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MFA_GRACE_DAYS * 86400,
  })

  return response
}
