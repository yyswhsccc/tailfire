// apps/ota/src/lib/entity-hubs/adapters/deal.adapter.ts

import type { Deal } from '@/types/deal'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'
import { formatPrice, calculateSavings } from '@/lib/format'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export const dealAdapter: HubAdapter<Deal> = {
  heroData(deal): HeroData {
    const hasOriginalPrice =
      deal.pricing.originalPriceCents != null && deal.pricing.fromPriceCents != null
    const savings = hasOriginalPrice
      ? calculateSavings(deal.pricing.originalPriceCents!, deal.pricing.fromPriceCents!)
      : 0

    const daysUntilExpiry = deal.validUntil
      ? Math.ceil((new Date(deal.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    const urgencyBadge =
      daysUntilExpiry != null && daysUntilExpiry > 0 && daysUntilExpiry <= 7
        ? `\u23F0 Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
        : daysUntilExpiry != null && daysUntilExpiry <= 0
          ? '\u23F0 Expires today'
          : savings > 0
            ? `Save ${savings}%`
            : undefined

    return {
      imageUrl: deal.heroImageUrl ?? null,
      fallbackGradient: 'bg-gradient-to-br from-[#3a2a1a] via-[#2a1a0a] to-[#1A1A1A]',
      badge: deal.productType === 'cruise' ? 'PROMOTION' : 'OFFER',
      title: deal.title,
      description: deal.description,
      urgencyBadge,
      ctaLabel: 'Inquire About This Offer',
    }
  },

  contextPills(deal): ContextPill[] {
    const pills: ContextPill[] = []

    if (deal.supplierName) {
      pills.push({ icon: '\uD83C\uDFE2', label: deal.supplierName })
    }

    if (deal.validUntil) {
      pills.push({ icon: '\uD83D\uDCC5', label: `Valid until ${fmtDate(deal.validUntil)}` })
    }

    const hasOriginalPrice =
      deal.pricing.originalPriceCents != null && deal.pricing.fromPriceCents != null
    const savings = hasOriginalPrice
      ? calculateSavings(deal.pricing.originalPriceCents!, deal.pricing.fromPriceCents!)
      : 0
    const savingsAmount = hasOriginalPrice
      ? deal.pricing.originalPriceCents! - deal.pricing.fromPriceCents!
      : 0

    if (deal.pricing.fromPriceCents != null) {
      pills.push({
        icon: '\uD83D\uDCB0',
        label: `From ${formatPrice(deal.pricing.fromPriceCents)}/person`,
        accent: true,
      })
    }

    if (savings > 0) {
      pills.push({
        icon: '\uD83C\uDFF7\uFE0F',
        label: `Save ${savings}% (${formatPrice(savingsAmount)} off)`,
        accent: true,
      })
    }

    return pills
  },

  sections(deal): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []

    if (deal.destinations && deal.destinations.length > 0) {
      sections.push({
        key: 'destinations',
        title: '\uD83D\uDCCD Destinations',
        props: {
          // Deal destinations are plain strings — DestinationsSection's lightweight
          // fallback path handles them (renders simple location cards).
          destinations: deal.destinations,
        },
        priority: 'medium',
      })
    }

    return sections
  },

  aiContext(deal): AiPageContext {
    return {
      entityType: 'deal',
      entityName: deal.title,
      entitySlug: deal.slug,
    }
  },
}
