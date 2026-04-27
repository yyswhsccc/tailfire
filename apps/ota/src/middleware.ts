import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

function extractAdvisorSlug(request: NextRequest): string | null {
  // Check URL path: /advisor/jane-smith or /advisor/jane-smith/deals
  const pathMatch = request.nextUrl.pathname.match(/^\/advisor\/([^/]+)/)
  if (pathMatch?.[1]) return pathMatch[1]

  // Check ?ref= query parameter
  const ref = request.nextUrl.searchParams.get('ref')
  if (ref) return ref

  return null
}

export async function middleware(request: NextRequest) {
  // Refresh Supabase session first so auth cookies stay valid across subdomains
  const { supabaseResponse } = await updateSession(request)

  const isProduction = process.env.NODE_ENV === 'production'
  const cookieOptions = {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax' as const,
    secure: isProduction,
  }

  // Extract advisor slug from URL path or ?ref= param
  const advisorSlug = extractAdvisorSlug(request)

  if (advisorSlug) {
    // Always overwrite ota_ref when visiting an advisor page or using ?ref=
    // The most recent advisor interaction gets attribution (last-touch)
    supabaseResponse.cookies.set('ota_ref', advisorSlug, cookieOptions)
  }

  // Ensure an anonymous session cookie exists
  const existingSession = request.cookies.get('ota_session')?.value
  if (!existingSession) {
    supabaseResponse.cookies.set('ota_session', crypto.randomUUID(), cookieOptions)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all page routes; skip _next internals, API routes, and static files
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.[^/]+$).*)',
  ],
}
