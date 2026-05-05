/**
 * Consumer activity tracking helpers.
 *
 * Fire-and-forget — never blocks UI or throws errors.
 * All functions are safe to call from any client component.
 */

/**
 * Send a consumer activity event to the tracking API.
 * sessionId is injected server-side by the OTA proxy route from the ota_session cookie.
 */
export function trackEvent(event: {
  event: string
  entityType?: string
  entitySlug?: string
  entityName?: string
  searchQuery?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) {
  // Fire and forget — no await, no error handling
  // sessionId is NOT sent from the browser; the proxy injects it from the httpOnly cookie
  fetch('/api/consumer-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
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
