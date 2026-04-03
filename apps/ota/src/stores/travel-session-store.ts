'use client'

import { create } from 'zustand'
import { TRAVEL_SESSION_DEFAULTS, TRAVEL_SESSION_COOKIE, type TravelSession } from '@/lib/travel-session'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60

function readCookie(): Partial<TravelSession> {
  if (typeof document === 'undefined') return {}
  try {
    const match = document.cookie.match(new RegExp(`${TRAVEL_SESSION_COOKIE}=([^;]+)`))
    return match ? JSON.parse(decodeURIComponent(match[1]!)) : {}
  } catch {
    return {}
  }
}

function writeCookie(state: TravelSession) {
  if (typeof document === 'undefined') return
  const val = encodeURIComponent(JSON.stringify(state))
  document.cookie = `${TRAVEL_SESSION_COOKIE}=${val}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

interface TravelSessionState extends TravelSession {
  setDates: (departure: string, returnDate: string) => void
  setOrigin: (iata: string, city: string, source: TravelSession['originSource']) => void
  setAdults: (n: number) => void
  dismissPrompt: () => void
  clearDates: () => void
  hasDates: () => boolean
}

export const useTravelSession = create<TravelSessionState>((set, get) => {
  const persisted = readCookie()
  const initial = { ...TRAVEL_SESSION_DEFAULTS, ...persisted }

  return {
    ...initial,
    setDates(departure, returnDate) {
      set({ departureDate: departure, returnDate })
      writeCookie({ ...get(), departureDate: departure, returnDate })
    },
    setOrigin(iata, city, source) {
      set({ origin: iata, originCity: city, originSource: source })
      writeCookie({ ...get(), origin: iata, originCity: city, originSource: source })
    },
    setAdults(n) {
      set({ adults: n })
      writeCookie({ ...get(), adults: n })
    },
    dismissPrompt() {
      set({ dismissedDatePrompt: true })
      writeCookie({ ...get(), dismissedDatePrompt: true })
    },
    clearDates() {
      set({ departureDate: null, returnDate: null })
      writeCookie({ ...get(), departureDate: null, returnDate: null })
    },
    hasDates() {
      return !!(get().departureDate && get().returnDate)
    },
  }
})
