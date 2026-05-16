/**
 * useTripTravelerAvatars — derived view of trip travelers shaped for the
 * "Travelers (X of Y)" header on activity edit forms.
 *
 * #438: the typed-component forms (flight, lodging, transportation, dining,
 * port_info, options, custom_cruise, tour) previously read `trip?.travelers`,
 * but `TripsService.findOne` returns only the trips table columns — that
 * field is always undefined, so every form rendered "Travelers (0 of 0)".
 * Use this hook instead; it pulls from the dedicated trip-travelers
 * endpoint that already powers EditTravelersDialog.
 */
import { useMemo } from 'react'
import { useTripTravelers } from './use-trip-travelers'

export interface TravelerAvatar {
  id: string
  name: string
  initials: string
}

export function useTripTravelerAvatars(tripId: string | null | undefined): TravelerAvatar[] {
  const { data: travelers = [] } = useTripTravelers(tripId ?? '', { enabled: !!tripId })

  return useMemo(() => {
    return travelers.map((t) => {
      const snapshot = (t.contactSnapshot ?? null) as { firstName?: string; lastName?: string } | null
      const first = (snapshot?.firstName ?? t.contact?.firstName ?? '').trim()
      const last = (snapshot?.lastName ?? t.contact?.lastName ?? '').trim()
      const name = `${first} ${last}`.trim() || 'Unknown'
      const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
      return { id: t.id, name, initials }
    })
  }, [travelers])
}
