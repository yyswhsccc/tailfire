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
const authRoutes = ['/auth/login', '/auth/forgot-password']

// Routes that require a session but should NOT redirect to /trips
// (user must be authenticated to change password, but needs to stay on the page)
const authenticatedAuthRoutes = ['/auth/reset-password', '/auth/set-password']

// Routes that are always public (no auth checks)
const publicRoutes = ['/auth/callback']

// Routes accessible by pending users (before password is set)
const pendingAllowedRoutes = ['/auth/set-password', '/auth/callback']

// Routes exempt from MFA checks (user must access these to complete MFA)
const mfaExemptRoutes = ['/auth/mfa-verify', '/auth/mfa-enroll', '/auth/callback', '/auth/login']

// Proposal preview accepts a short-lived pdfToken (HMAC, validated by the API)
// so Puppeteer can render the live preview during PDF generation.
const PDF_PREVIEW_PATH = /^\/trips\/[^/]+\/preview\/?$/

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Skip middleware for static files, API routes, and Sentry tunnel
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/monitoring') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Allow Puppeteer-rendered PDF preview through without a session.
  if (PDF_PREVIEW_PATH.test(pathname) && searchParams.get('pdfToken')) {
    return NextResponse.next()
  }

  const { user, userStatus, aal, hasMfaFactors, supabaseResponse } = await updateSession(request)

  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))
  const isAuthenticatedAuthRoute = authenticatedAuthRoutes.some((route) => pathname.startsWith(route))
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // Check for restricted auth flow (recovery or invite — session can only access password pages)
  const authFlow = request.cookies.get('auth_flow')?.value
  if (authFlow && user) {
    const allowedPaths = authFlow === 'recovery'
      ? ['/auth/reset-password', '/auth/signout']
      : ['/auth/set-password', '/profile', '/auth/signout']

    const isAllowed = allowedPaths.some((p) => pathname.startsWith(p))
      || isPublicRoute

    if (!isAllowed) {
      // Restricted session trying to access dashboard — redirect back to password page
      const redirectPath = authFlow === 'recovery' ? '/auth/reset-password' : '/auth/set-password'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
    return supabaseResponse
  }

  // Public routes pass through
  if (isPublicRoute) {
    return supabaseResponse
  }

  // Password reset/set pages: require session, but don't redirect away
  if (isAuthenticatedAuthRoute) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
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

  // Block consumer/portal users — this is the admin app, not the client portal
  const isPortalUser = user.app_metadata?.portal_user === true
  if (isPortalUser) {
    const portalUrl = process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca'
    return NextResponse.redirect(portalUrl)
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

  // MFA enforcement (NEXT_PUBLIC_ required for Edge middleware visibility)
  const mfaRequired = process.env.NEXT_PUBLIC_MFA_REQUIRED === 'true'
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
