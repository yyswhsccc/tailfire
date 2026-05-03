/**
 * Consumer activity tracking helpers.
 *
 * Fire-and-forget — never blocks UI or throws errors.
 * All functions are safe to call from any client component.
 */

/**
 * Send a consumer activity event to the tracking API.
 * Reads the ota_session cookie and POSTs to the OTA proxy route.
 */
export function trackEvent(event: {
  event: string
  entityType?: string
  entitySlug?: string
  entityName?: string
  searchQuery?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) {
  // Read session ID from cookie
  const sessionId = document.cookie
    .split('; ')
    .find((c) => c.startsWith('ota_session='))
    ?.split('=')[1]

  if (!sessionId) return

  // Fire and forget — no await, no error handling
  fetch('/api/consumer-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...event }),
  }).catch(() => {
    // Silently ignore — tracking must never break the UI
  })
}

export function trackPageView(entityType: string, entitySlug: string, entityName: string) {
  trackEvent({ event: 'page_view', entityType, entitySlug, entityName })
}

export function trackSearch(entityType: string, query: Record<string, unknown>, resultCount: number) {
  trackEvent({ event: 'search', entityType, searchQuery: { ...query, resultCount } })
}
