/**
 * JSON-LD structured data helpers for Phoenix Voyages OTA.
 * Generates schema.org-compliant objects for injection via <script type="application/ld+json">.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ota.phoenixvoyages.ca'

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export function generateOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: 'Phoenix Voyages',
    url: SITE_URL,
    logo: 'https://cdn.tailfire.ca/photos/og/phoenix-voyages/cover_image_fb_og.jpg',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      areaServed: 'CA',
      availableLanguage: ['English', 'French'],
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ottawa',
      addressRegion: 'ON',
      addressCountry: 'CA',
    },
    sameAs: [
      'https://www.facebook.com/PhoenixVoyages',
      'https://www.instagram.com/phoenixvoyages',
    ],
  }
}

// ---------------------------------------------------------------------------
// SearchAction (sitelinks search box)
// ---------------------------------------------------------------------------

export function generateSearchActionJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Phoenix Voyages',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/deals?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// ---------------------------------------------------------------------------
// Deal (Product + Offer)
// ---------------------------------------------------------------------------

export interface DealJsonLdInput {
  id: string
  name: string
  description?: string
  imageUrl?: string
  priceCents?: number
  currency?: string
  supplier?: string
  validUntil?: string | Date
  url?: string
}

export function generateDealJsonLd(deal: DealJsonLdInput) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: deal.name,
    url: deal.url ?? `${SITE_URL}/deals/${deal.id}`,
  }

  if (deal.description) schema.description = deal.description
  if (deal.imageUrl) schema.image = deal.imageUrl
  if (deal.supplier) schema.brand = { '@type': 'Brand', name: deal.supplier }

  if (deal.priceCents !== undefined) {
    const price = (deal.priceCents / 100).toFixed(2)
    const offerSchema: Record<string, unknown> = {
      '@type': 'Offer',
      priceCurrency: deal.currency ?? 'CAD',
      price,
      availability: 'https://schema.org/InStock',
    }
    if (deal.validUntil) {
      offerSchema.priceValidUntil =
        deal.validUntil instanceof Date
          ? deal.validUntil.toISOString().split('T')[0]
          : deal.validUntil
    }
    schema.offers = offerSchema
  }

  return schema
}

// ---------------------------------------------------------------------------
// Advisor (Person)
// ---------------------------------------------------------------------------

export interface AdvisorJsonLdInput {
  id: string
  slug?: string
  name: string
  bio?: string
  imageUrl?: string
  jobTitle?: string
  email?: string
}

export function generateAdvisorJsonLd(advisor: AdvisorJsonLdInput) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: advisor.name,
    url: `${SITE_URL}/advisor/${advisor.slug ?? advisor.id}`,
    worksFor: {
      '@type': 'TravelAgency',
      name: 'Phoenix Voyages',
      url: SITE_URL,
    },
  }

  if (advisor.bio) schema.description = advisor.bio
  if (advisor.imageUrl) schema.image = advisor.imageUrl
  if (advisor.jobTitle) schema.jobTitle = advisor.jobTitle
  if (advisor.email) schema.email = advisor.email

  return schema
}
