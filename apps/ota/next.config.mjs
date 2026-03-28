/** @type {import('next').NextConfig} */

// Client portal URL - configure per environment
const CLIENT_PORTAL_URL = process.env.CLIENT_PORTAL_URL || 'https://portal.yourdomain.com';

const nextConfig = {
  transpilePackages: ['@tailfire/ui-public'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.tailfire.ca' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: 'agentprofiler.travelleaders.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'static.traveltek.net' },
      { protocol: 'https', hostname: 'images.globusfamily.com' },
      { protocol: 'https', hostname: 'dynamic-media-cdn.tripadvisor.com', pathname: '/**' },
    ],
  },
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

    const clientPortalRedirects = [
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

    const wordPressRedirects = [
      // Core pages
      { source: '/about-us', destination: '/about', permanent: true },
      { source: '/contact-us', destination: '/contact', permanent: true },
      { source: '/plan-your-trip', destination: '/', permanent: true },
      { source: '/book', destination: '/search/all-inclusives', permanent: true },
      { source: '/join-us', destination: '/join', permanent: true },
      { source: '/terms-and-conditions', destination: '/terms', permanent: true },

      // SEO content pages
      { source: '/cruise-deals', destination: '/deals?type=cruises', permanent: true },
      { source: '/caribbean-cruise-deals', destination: '/deals?type=cruises', permanent: true },
      { source: '/caribbean-deals', destination: '/deals', permanent: true },
      { source: '/all-inclusive-deals', destination: '/deals?type=package', permanent: true },
      { source: '/all-inclusive-vacations', destination: '/deals?type=package', permanent: true },
      { source: '/europe-deals', destination: '/deals', permanent: true },
      { source: '/flash-deals', destination: '/deals', permanent: true },
      { source: '/last-minute-cruise-deals', destination: '/deals?type=cruises', permanent: true },
      { source: '/cruise-deals-toronto', destination: '/deals?type=cruises', permanent: true },

      // Cruise line pages
      { source: '/royal-caribbean-canada', destination: '/search/cruises', permanent: true },
      { source: '/celebrity-cruises-canada', destination: '/search/cruises', permanent: true },
      { source: '/holland-america-cruises', destination: '/search/cruises', permanent: true },
      { source: '/princess-cruises-canada', destination: '/search/cruises', permanent: true },
      { source: '/silversea-cruises', destination: '/search/cruises', permanent: true },
      { source: '/norwegian-cruise-line', destination: '/search/cruises', permanent: true },
      { source: '/cruise-planning-guide', destination: '/search/cruises', permanent: true },
      { source: '/cruise-ports-canada', destination: '/search/cruises', permanent: true },
      { source: '/bordeaux-river-cruise', destination: '/search/cruises', permanent: true },
      { source: '/rhine-river-cruise', destination: '/search/cruises', permanent: true },

      // Category pages
      { source: '/luxury-travel', destination: '/deals', permanent: true },
      { source: '/family-travel', destination: '/deals', permanent: true },
      { source: '/group-travel', destination: '/deals', permanent: true },
      { source: '/destination-weddings', destination: '/deals', permanent: true },
      { source: '/incentive-travel', destination: '/contact', permanent: true },
      { source: '/travel-insurance', destination: '/contact', permanent: true },
      { source: '/travel-agency-ontario', destination: '/join/travel-agency-ontario', permanent: true },
      { source: '/travel-agents-ottawa', destination: '/join/travel-agents-ottawa', permanent: true },

      // Agent recruitment redirects (WordPress → OTA /join)
      { source: '/become-a-travel-agent', destination: '/join/become-a-travel-agent', permanent: true },
      { source: '/host-travel-agency-canada', destination: '/join/host-travel-agency', permanent: true },
      { source: '/host-agency-comparison-canada', destination: '/join/host-agency-comparison', permanent: true },
      { source: '/home-based-travel-agent-canada', destination: '/join/home-based-travel-agent', permanent: true },
      { source: '/tico-certification', destination: '/join/tico-certification', permanent: true },
      { source: '/how-much-do-travel-agents-make', destination: '/join/travel-agent-salary', permanent: true },
      { source: '/travel-agent-training-canada', destination: '/join/training', permanent: true },
      { source: '/travel-agency-franchise-canada', destination: '/join/franchise', permanent: true },
      { source: '/canada-travel-statistics', destination: '/join/canada-travel-statistics', permanent: true },
      { source: '/tico-travel-protection', destination: '/join/tico-protection', permanent: true },

      // Competitor comparisons
      { source: '/phoenix-voyages-vs-travelonly', destination: '/join/vs-travelonly', permanent: true },
      { source: '/phoenix-voyages-vs-ttand', destination: '/join/vs-ttand', permanent: true },
      { source: '/phoenix-voyages-vs-trevello', destination: '/join/vs-trevello', permanent: true },
      { source: '/phoenix-voyages-vs-nexion', destination: '/join/vs-nexion', permanent: true },

      // Supplier deal pages
      { source: '/deals/royal-caribbean', destination: '/deals?supplier=royal-caribbean', permanent: true },
      { source: '/deals/celebrity-cruises', destination: '/deals?supplier=celebrity-cruises', permanent: true },
      { source: '/deals/princess-cruises', destination: '/deals?supplier=princess-cruises', permanent: true },
      { source: '/deals/silversea', destination: '/deals?supplier=silversea', permanent: true },
      { source: '/deals/viking', destination: '/deals?supplier=viking', permanent: true },
      { source: '/deals/oceania-cruises', destination: '/deals?supplier=oceania-cruises', permanent: true },
      { source: '/deals/virgin-voyages', destination: '/deals?supplier=virgin-voyages', permanent: true },
      { source: '/deals/amawaterways', destination: '/deals?supplier=amawaterways', permanent: true },
      { source: '/deals/globus', destination: '/deals?supplier=globus', permanent: true },
      { source: '/deals/sandals-resorts', destination: '/deals?supplier=sandals', permanent: true },
      { source: '/deals/air-canada-vacations', destination: '/deals?supplier=air-canada', permanent: true },
      { source: '/deals/sunwing-vacations', destination: '/deals?supplier=sunwing', permanent: true },
      { source: '/deals/westjet-vacations', destination: '/deals?supplier=westjet', permanent: true },

      // Promo pages (bulk redirect)
      { source: '/promo/:id', destination: '/deals', permanent: true },

      // Standalone pages
      { source: '/amawaterways', destination: '/deals?supplier=amawaterways', permanent: true },
      { source: '/celebrity-xcel-caribbean-feb-2026', destination: '/deals', permanent: true },
      { source: '/royal-caribbean-march-2026', destination: '/deals', permanent: true },
      { source: '/globus-escapes-europe-mar-2026', destination: '/deals', permanent: true },
      { source: '/exoticca-morocco-tours-feb-2026', destination: '/deals', permanent: true },
      { source: '/silversea-q2-2026-flash', destination: '/deals', permanent: true },
      { source: '/travel-reads', destination: '/', permanent: false }, // Blog — may return later
    ];

    return [...clientPortalRedirects, ...wordPressRedirects];
  },
};

export default nextConfig;
