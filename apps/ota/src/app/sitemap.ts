import type { MetadataRoute } from 'next'
import { joinArticles } from '@/content/join/articles'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ota.phoenixvoyages.ca'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages = [
    '',
    '/about',
    '/contact',
    '/terms',
    '/privacy',
    '/deals',
    '/advisors',
    '/search/cruises',
    '/search/flights',
    '/search/hotels',
    '/search/tours',
    '/search/all-inclusives',
    '/join',
    '/join/register',
    '/join/learn-more',
  ].map(path => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1.0 : 0.8,
  }))

  // Join article pages (from static content data)
  const joinArticlePages: MetadataRoute.Sitemap = joinArticles.map(article => ({
    url: `${BASE_URL}/join/${article.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  // Dynamic pages from API (deals, advisor profiles)
  let dealPages: MetadataRoute.Sitemap = []
  let advisorPages: MetadataRoute.Sitemap = []

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.tailfire.ca/api/v1'

    const [dealsRes, advisorsRes] = await Promise.allSettled([
      fetch(`${apiBase}/cruise-repository/deals?limit=500`, { next: { revalidate: 3600 } }),
      fetch(`${apiBase}/advisors/public?limit=200`, { next: { revalidate: 3600 } }),
    ])

    if (dealsRes.status === 'fulfilled' && dealsRes.value.ok) {
      const data = await dealsRes.value.json()
      const deals: Array<{ id: string; updatedAt?: string }> = Array.isArray(data)
        ? data
        : (data?.data ?? data?.deals ?? [])
      dealPages = deals.map(deal => ({
        url: `${BASE_URL}/deals/${deal.id}`,
        lastModified: deal.updatedAt ? new Date(deal.updatedAt) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }))
    }

    if (advisorsRes.status === 'fulfilled' && advisorsRes.value.ok) {
      const data = await advisorsRes.value.json()
      const advisors: Array<{ slug?: string; id: string; updatedAt?: string }> = Array.isArray(data)
        ? data
        : (data?.data ?? data?.advisors ?? [])
      advisorPages = advisors.map(advisor => ({
        url: `${BASE_URL}/advisor/${advisor.slug ?? advisor.id}`,
        lastModified: advisor.updatedAt ? new Date(advisor.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // API unavailable — fall back to static pages only
  }

  return [...staticPages, ...joinArticlePages, ...dealPages, ...advisorPages]
}
