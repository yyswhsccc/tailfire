export interface Deal {
  id: string
  slug: string
  title: string
  description?: string
  heroImageUrl?: string
  productType: string
  supplierName?: string
  pricing: {
    fromPriceCents?: number
    currency?: string
    priceNote?: string
    originalPriceCents?: number
  }
  validFrom?: string
  validUntil?: string
  destinations?: string[]
  seoMeta?: { title?: string; description?: string; ogImage?: string }
}
