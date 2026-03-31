/**
 * OTA Search Cache Service
 *
 * Simple in-memory cache for OTA search enrichment data.
 * Reduces redundant Amadeus API calls for data that changes infrequently.
 *
 * Cache TTLs:
 * - Flight dates (cheapest dates): 1 hour
 * - Price metrics (historical): 6 hours
 * - Direct destinations (airport routes): 24 hours
 */

import { Injectable } from '@nestjs/common'

@Injectable()
export class OtaSearchCacheService {
  private cache = new Map<string, { data: any; expiresAt: number }>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  set(key: string, data: any, ttlSeconds: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 })
    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      const now = Date.now()
      for (const [k, v] of this.cache) {
        if (now > v.expiresAt) this.cache.delete(k)
      }
    }
  }
}
