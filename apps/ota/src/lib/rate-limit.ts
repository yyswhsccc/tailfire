import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ---------------------------------------------------------------------------
// Rate limiter for the /api/chat endpoint
//
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
// When those vars are absent (local dev / non-Upstash deployments) the module
// exports a no-op limiter so the chat route still works without Redis.
// ---------------------------------------------------------------------------

function buildRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  try {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      // 20 requests per sliding hour per IP
      limiter: Ratelimit.slidingWindow(20, '1 h'),
      analytics: true,
      prefix: 'ota:chat',
    })
  } catch {
    console.warn('[rate-limit] Failed to initialise Upstash Ratelimit — rate limiting disabled')
    return null
  }
}

export const chatRateLimit = buildRatelimit()

// ---------------------------------------------------------------------------
// Rate limiter for the /api/trip-requests endpoint
//
// 100 requests per sliding hour per IP — higher than chat since trip request
// submissions are less expensive, but still needs abuse protection.
// ---------------------------------------------------------------------------

function buildTripRequestRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  try {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      // 100 requests per sliding hour per IP
      limiter: Ratelimit.slidingWindow(100, '1 h'),
      analytics: true,
      prefix: 'ota:trip-requests',
    })
  } catch {
    console.warn('[rate-limit] Failed to initialise Upstash Ratelimit for trip-requests — rate limiting disabled')
    return null
  }
}

export const tripRequestRateLimit = buildTripRequestRatelimit()
