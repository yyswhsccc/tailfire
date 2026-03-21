/**
 * API Health Dashboard Types
 *
 * Type definitions for the API health monitoring system.
 */

export const HEALTH_PROVIDERS = [
  // Travel
  { key: 'amadeus', name: 'Amadeus', category: 'travel' },
  { key: 'aerodatabox', name: 'AeroDataBox', category: 'travel' },
  { key: 'traveltek', name: 'Traveltek/FusionAPI', category: 'travel' },
  { key: 'globus', name: 'Globus/Catalog', category: 'travel' },
  // Services
  { key: 'google_places', name: 'Google Places', category: 'services' },
  { key: 'stripe', name: 'Stripe', category: 'services' },
  { key: 'resend', name: 'Resend', category: 'services' },
  { key: 'unsplash', name: 'Unsplash', category: 'services' },
  { key: 'openai', name: 'OpenAI', category: 'services' },
  { key: 'exchange_rates', name: 'ExchangeRate-API', category: 'services' },
  // Storage
  { key: 'cloudflare_r2', name: 'Cloudflare R2', category: 'storage' },
  { key: 'supabase_storage', name: 'Supabase Storage', category: 'storage' },
  { key: 'backblaze_b2', name: 'Backblaze B2', category: 'storage' },
  // Infrastructure
  { key: 'redis', name: 'Redis', category: 'infrastructure' },
  { key: 'traveltek_ftp', name: 'Traveltek FTP', category: 'infrastructure' },
] as const

export type HealthProviderKey = (typeof HEALTH_PROVIDERS)[number]['key']

export interface HealthCheckResult {
  provider: HealthProviderKey
  success: boolean
  responseMs: number
  error?: string
}

export interface ProviderStatus {
  provider: HealthProviderKey
  name: string
  category: string
  configured: boolean
  lastCheck?: {
    success: boolean
    responseMs: number
    error?: string
    checkedAt: string
  }
  consecutiveFailures: number
}
