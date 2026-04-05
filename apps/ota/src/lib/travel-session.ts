// apps/ota/src/lib/travel-session.ts
// Server-safe — NO 'use client' directive

export interface TravelSession {
  departureDate: string | null
  returnDate: string | null
  origin: string | null
  originCity: string | null
  originSource: 'user' | 'geolocation' | 'crm' | 'default'
  adults: number
  dismissedDatePrompt: boolean
}

export const TRAVEL_SESSION_DEFAULTS: TravelSession = {
  departureDate: null,
  returnDate: null,
  origin: 'YYZ',
  originCity: 'Toronto',
  originSource: 'default',
  adults: 2,
  dismissedDatePrompt: false,
}

export const TRAVEL_SESSION_COOKIE = 'travel_session'

export function parseTravelSessionCookie(cookieValue: string | undefined): TravelSession {
  if (!cookieValue) return TRAVEL_SESSION_DEFAULTS
  try {
    return { ...TRAVEL_SESSION_DEFAULTS, ...JSON.parse(decodeURIComponent(cookieValue)) }
  } catch {
    return TRAVEL_SESSION_DEFAULTS
  }
}
