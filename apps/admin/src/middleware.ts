/**
 * Auth Middleware
 *
 * Default-protected strategy: all routes require authentication
 * unless explicitly listed as public or auth routes.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that redirect to /trips if already authenticated
const authRoutes = ['/auth/login', '/auth/forgot-password', '/auth/reset-password']

// Routes that are always public (no auth checks)
// Note: /auth/signout is a POST-only route handler, not a page
const publicRoutes = ['/auth/callback']

// Routes accessible by pending users (before password is set)
const pendingAllowedRoutes = ['/auth/set-password', '/auth/callback']

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

  const { user, userStatus, supabaseResponse } = await updateSession(request)

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
