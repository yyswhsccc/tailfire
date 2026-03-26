import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

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
    // Set referral cookie only if one is not already present
    const existingRef = request.cookies.get('ota_ref')?.value
    if (!existingRef) {
      response.cookies.set('ota_ref', advisorSlug, cookieOptions)
    }
  }

  // Ensure an anonymous session cookie exists
  const existingSession = request.cookies.get('ota_session')?.value
  if (!existingSession) {
    response.cookies.set('ota_session', crypto.randomUUID(), cookieOptions)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all page routes; skip _next internals, API routes, and static files
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.[^/]+$).*)',
  ],
}
