import { API_URL, CATALOG_API_KEY, OTA_SERVICE_KEY } from '@/lib/config'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function fetchWithTimeout<T>(
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  const url = `${API_URL}${path}`

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = await res.text().catch(() => undefined)
      }
      throw new ApiError(`API request failed: ${res.status} ${res.statusText}`, res.status, body)
    }

    return res.json() as Promise<T>
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Catalog fetch — for catalog endpoints that use x-catalog-api-key.
 * Used by: cruise search, tour search.
 */
export async function catalogFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return fetchWithTimeout<T>(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      'x-catalog-api-key': CATALOG_API_KEY,
    },
  })
}

/**
 * Service fetch — for OTA-specific endpoints that use x-ota-service-key.
 * Used by: lead capture, referral logging, flight/hotel search facades.
 */
export async function serviceFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return fetchWithTimeout<T>(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      'x-ota-service-key': OTA_SERVICE_KEY,
    },
  })
}

/**
 * Public fetch — no auth, for fully public endpoints.
 * Used by: deals listing, advisor profiles.
 */
export async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return fetchWithTimeout<T>(path, {
    ...options,
    headers: options.headers as Record<string, string>,
  })
}
