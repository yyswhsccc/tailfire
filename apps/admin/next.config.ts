import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Transpile workspace packages
  transpilePackages: ['@tailfire/shared-types', '@tailfire/trip-proposal-ui', '@tailfire/ui-public'],

  eslint: {
    ignoreDuringBuilds: true,
  },

  // External image domains (cruise ship images and logos from Traveltek, R2 storage, Supabase)
  images: {
    qualities: [75, 85, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.traveltek.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static3.traveltek.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'pub-0ab7614dd4094206aa5c733bea70d570.r2.dev',
        pathname: '/**',
      },
      // R2 Storage - Media (activity images, bug report screenshots)
      {
        protocol: 'https',
        hostname: 'pub-d66b3fc17cef4970810f03892f5a76e6.r2.dev',
        pathname: '/**',
      },
      // Supabase Storage - Dev
      {
        protocol: 'https',
        hostname: 'hplioumsywqgtnhwcivw.supabase.co',
        pathname: '/storage/**',
      },
      // Supabase Storage - Preview
      {
        protocol: 'https',
        hostname: 'gaqacfstpnmwphekjzae.supabase.co',
        pathname: '/storage/**',
      },
      // Supabase Storage - Prod
      {
        protocol: 'https',
        hostname: 'cmktvanwglszgadjrorm.supabase.co',
        pathname: '/storage/**',
      },
      // Holibob (Amadeus Activities tour images)
      {
        protocol: 'https',
        hostname: 'images.holibob.tech',
        pathname: '/**',
      },
    ],
  },

  // Environment variables to expose to the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  },

  // Proxy API calls through same origin to avoid CORS issues on corporate networks
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN || 'http://localhost:3101'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ]
  },

  // Security headers (exempt /auth/callback which uses inline scripts)
  async headers() {
    return [
      {
        source: '/((?!auth/callback).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Cloudflare Pages compatibility
  output: 'standalone',

  // Redirect legacy /packages/* URLs to /activities/* equivalents
  // Packages are activities with activityType='package' - no separate pages needed
  async redirects() {
    return [
      // /trips/:id/packages/new → /trips/:id/activities/new?type=package
      {
        source: '/trips/:id/packages/new',
        destination: '/trips/:id/activities/new?type=package',
        permanent: false,
      },
      // /trips/:id/packages/:packageId → /trips/:id/activities/:packageId/edit?type=package
      {
        source: '/trips/:id/packages/:packageId',
        destination: '/trips/:id/activities/:packageId/edit?type=package',
        permanent: false,
      },
      // Legacy /bookings/* routes also redirect to /activities/*
      {
        source: '/trips/:id/bookings/new',
        destination: '/trips/:id/activities/new?type=package',
        permanent: false,
      },
      {
        source: '/trips/:id/bookings/:bookingId',
        destination: '/trips/:id/activities/:bookingId/edit?type=package',
        permanent: false,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: '/monitoring',
})
