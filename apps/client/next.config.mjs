/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tailfire/ui-public', '@tailfire/api-client', '@tailfire/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
