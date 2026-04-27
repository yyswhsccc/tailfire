/**
 * Auth Middleware
 *
 * Default-protected strategy: all routes require authentication
 * unless explicitly listed as public or auth routes.
 * MFA enforcement: when MFA_REQUIRED=true, redirects aal1 users to verify/enroll.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that redirect to /trips if already authenticated
const authRoutes = ['/auth/login', '/auth/forgot-password', '/auth/reset-password']

// Routes that are always public (no auth checks)
const publicRoutes = ['/auth/callback']

// Routes accessible by pending users (before password is set)
const pendingAllowedRoutes = ['/auth/set-password', '/auth/callback']

// Routes exempt from MFA checks (user must access these to complete MFA)
const mfaExemptRoutes = ['/auth/mfa-verify', '/auth/mfa-enroll', '/auth/callback', '/auth/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files, API routes, and Sentry tunnel
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/monitoring') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const { user, userStatus, aal, hasMfaFactors, supabaseResponse } = await updateSession(request)

  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // Public routes pass through
  if (isPublicRoute) {
    return supabaseResponse
  }

  // Auth routes redirect authenticated users to /trips
  if (isAuthRoute) {
    if (user) {
      return NextResponse.redirect(new URL('/trips', request.url))
    }
    return supabaseResponse
  }

  // Root path handling
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/trips', request.url))
    }
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // DEFAULT: Everything else requires authentication
  if (!user) {
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Pending users must set their password before accessing the app
  if (userStatus === 'pending') {
    const isPendingAllowed = pendingAllowedRoutes.some((route) => pathname.startsWith(route))
    if (!isPendingAllowed) {
      return NextResponse.redirect(new URL('/auth/set-password', request.url))
    }
    // Pending users skip MFA checks — they need to activate first
    return supabaseResponse
  }

  // MFA enforcement (only when MFA_REQUIRED is true)
  const mfaRequired = process.env.MFA_REQUIRED === 'true'
  if (mfaRequired) {
    const isMfaExempt = mfaExemptRoutes.some((route) => pathname.startsWith(route))
    if (!isMfaExempt) {
      if (hasMfaFactors && aal === 'aal1') {
        // Has factors but hasn't verified yet → verify page
        const verifyUrl = new URL('/auth/mfa-verify', request.url)
        verifyUrl.searchParams.set('redirectTo', pathname)
        return NextResponse.redirect(verifyUrl)
      }
      if (!hasMfaFactors) {
        // Check if user is within the 7-day grace period (skip cookie)
        const mfaSkippedAt = request.cookies.get('mfa_skipped_at')?.value
        if (mfaSkippedAt) {
          const elapsed = Date.now() - Number(mfaSkippedAt)
          const graceDays = 7
          if (elapsed < graceDays * 24 * 60 * 60 * 1000) {
            // Within grace period — allow access
            return supabaseResponse
          }
        }
        // No factors enrolled and no/expired grace → enrollment page
        const enrollUrl = new URL('/auth/mfa-enroll', request.url)
        enrollUrl.searchParams.set('redirectTo', pathname)
        return NextResponse.redirect(enrollUrl)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
