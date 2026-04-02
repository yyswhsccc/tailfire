// apps/ota/src/lib/entity-hubs/types.ts

import type { ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export type EntityType = 'destination' | 'ship' | 'sailing' | 'cruise_line' | 'region' | 'deal'

// ---------------------------------------------------------------------------
// HubScaffold props
// ---------------------------------------------------------------------------

export interface HubScaffoldProps {
  hero: HeroData
  contextPills: ContextPill[]
  sections: SectionDescriptor[]
  aiContext: AiPageContext
  entityType: EntityType
  entitySlug: string
}

export interface HeroData {
  imageUrl: string | null
  fallbackGradient?: string
  badge: string
  urgencyBadge?: string
  title: string
  subtitle?: string
  description?: string
  ctaLabel?: string
}

export interface ContextPill {
  label: string
  icon?: string
  accent?: boolean
  href?: string
}

// ---------------------------------------------------------------------------
// Section system
// ---------------------------------------------------------------------------

export interface SectionDescriptor {
  key: string
  title: string
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string
  props: Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

export interface SectionEntry {
  component: ComponentType<SectionComponentProps>
  skeleton: SkeletonVariant
}

export interface SectionComponentProps {
  entityType: EntityType
  entitySlug: string
  title: string
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string
  sectionProps: Record<string, unknown>
}

export type SkeletonVariant = 'grid-2' | 'grid-3' | 'grid-4' | 'banner' | 'mosaic' | 'scroll' | 'timeline' | 'single'

// ---------------------------------------------------------------------------
// Browsing signals (optional in v1)
// ---------------------------------------------------------------------------

export interface BrowsingSignals {
  basketComponentTypes: string[]
  recentEntityTypes: string[]
  detectedAirport?: string
}

// ---------------------------------------------------------------------------
// AI context
// ---------------------------------------------------------------------------

export interface AiPageContext {
  entityType: EntityType
  entityName: string
  entitySlug: string
  availableProducts?: { type: string; count: number }[]
  detectedAirport?: string
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface HubAdapter<T> {
  heroData: (entity: T) => HeroData
  contextPills: (entity: T, counts?: Record<string, number>) => ContextPill[]
  sections: (entity: T, signals?: BrowsingSignals) => SectionDescriptor[]
  aiContext: (entity: T) => AiPageContext
}

// ---------------------------------------------------------------------------
// Card variant type
// ---------------------------------------------------------------------------

export type CardVariant = 'full' | 'compact' | 'mini'
