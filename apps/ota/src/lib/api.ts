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

/**
 * Extended options that include Next.js-specific fetch extensions.
 * `next.tags` enables on-demand ISR revalidation via `revalidateTag()`.
 * `next.revalidate` sets time-based revalidation (seconds) or `false` to opt out.
 */
type FetchOptions = RequestInit & {
  headers?: Record<string, string>
  next?: { tags?: string[]; revalidate?: number | false }
}

async function fetchWithTimeout<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  const url = `${API_URL}${path}`

  // Extract Next.js-specific options (not part of standard RequestInit)
  const { next: nextOptions, ...restOptions } = options

  try {
    const res = await fetch(url, {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        ...restOptions.headers,
      },
      signal: controller.signal,
      // Pass Next.js cache tags/revalidation options through
      ...(nextOptions ? { next: nextOptions } : {}),
    } as RequestInit)

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
export async function catalogFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
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
 *
 * Supports Next.js `next` options for ISR cache tagging:
 *   publicFetch('/deals', { next: { tags: ['deals'] } })
 */
export async function publicFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  return fetchWithTimeout<T>(path, {
    ...options,
    headers: options.headers as Record<string, string>,
  })
}
