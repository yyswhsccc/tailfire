/** @type {import('next').NextConfig} */

// Client portal URL - configure per environment
const CLIENT_PORTAL_URL = process.env.CLIENT_PORTAL_URL || 'https://portal.yourdomain.com';

const nextConfig = {
  transpilePackages: ['@tailfire/ui-public'],
  experimental: {
    optimizePackageImports: ['@tailfire/ui-public'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    // Skip redirects if portal URL not configured (dev mode)
    if (!process.env.CLIENT_PORTAL_URL && process.env.NODE_ENV === 'development') {
      return [];
    }

    return [
      {
        source: '/dashboard',
        destination: `${CLIENT_PORTAL_URL}/`,
        permanent: true,
      },
      {
        source: '/dashboard/:path*',
        destination: `${CLIENT_PORTAL_URL}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
