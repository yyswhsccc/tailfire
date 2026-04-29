/**
 * Auth Middleware
 *
 * Default-protected strategy: all routes require authentication
 * unless explicitly listed as public or auth routes.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that redirect to dashboard if already authenticated
const authRoutes = ['/login', '/forgot-password', '/reset-password']

// Routes that are always public (no auth checks)
const publicRoutes = ['/auth/callback', '/shared']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const { user, supabaseResponse } = await updateSession(request)

  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // Public routes pass through
  if (isPublicRoute) {
    return supabaseResponse
  }

  // Check if authenticated user is a portal/consumer user (not an admin)
  // Admin users have user_profiles with role='admin'|'user' but NO portal_user flag
  // Consumer users have app_metadata.portal_user = true
  const isPortalUser = user?.app_metadata?.portal_user === true
  const isAdmin = user && !isPortalUser

  // If logged in as admin, redirect to the admin app — this portal is for consumers only
  if (isAdmin && !isAuthRoute) {
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://tailfire.phoenixvoyages.ca'
    return NextResponse.redirect(adminUrl)
  }

  // Auth routes redirect authenticated portal users to home
  if (isAuthRoute) {
    if (user && isPortalUser) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    // Show login page for: unauthenticated users OR admin users (they need to sign in as consumer)
    return supabaseResponse
  }

  // Root path handling - allow if authenticated portal user
  if (pathname === '/') {
    if (!user || !isPortalUser) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // DEFAULT: Everything else requires authenticated portal user
  if (!user || !isPortalUser) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
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
