import type { MetadataRoute } from 'next'

// B5 (Al's decision 2026-05-15): OTA lives at the apex phoenixvoyages.ca
// post-WordPress cutover. Until cutover the apex still serves WordPress —
// keep `NEXT_PUBLIC_SITE_URL` overridable so dev/preview can keep using
// `tf-demo.phoenixvoyages.ca` / `ota.phoenixvoyages.ca`.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://phoenixvoyages.ca'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
