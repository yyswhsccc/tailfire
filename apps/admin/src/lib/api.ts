import type { ServerFieldError } from './validation/types'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

/**
 * Get authorization headers with the current session token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = {}

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const impersonateUserId = typeof window !== 'undefined' ? localStorage.getItem('impersonate-user-id') : null
  if (impersonateUserId) {
    headers['X-Impersonate-User-Id'] = impersonateUserId
  }

  return headers
}

/**
 * Normalizes server error response to ServerFieldError[] format.
 * Handles two formats:
 * 1. { fieldErrors: [{field, message}] } - direct format
 * 2. { errors: Record<string, string[]> } - record format
 */
function normalizeFieldErrors(errorBody: unknown): ServerFieldError[] | undefined {
  if (!errorBody || typeof errorBody !== 'object') return undefined

  const body = errorBody as Record<string, unknown>

  // Format 1: { fieldErrors: [{field, message}] }
  if (Array.isArray(body.fieldErrors) && body.fieldErrors.length > 0) {
    return body.fieldErrors.filter(
      (e): e is ServerFieldError =>
        typeof e === 'object' && e !== null && 'field' in e && 'message' in e
    )
  }

  // Format 2: { errors: Record<string, string[]> }
  if (body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)) {
    const errors = body.errors as Record<string, string[]>
    const normalized: ServerFieldError[] = []
    for (const [field, messages] of Object.entries(errors)) {
      if (Array.isArray(messages) && messages.length > 0) {
        for (const message of messages) {
          if (typeof message === 'string') {
            normalized.push({ field, message })
          }
        }
      }
    }
    return normalized.length > 0 ? normalized : undefined
  }

  return undefined
}

/**
 * Handles error responses by parsing the body and throwing ApiError.
 * Shared between fetchApi and fetchApiFormData to avoid duplication.
 */
async function handleErrorResponse(response: Response): Promise<never> {
  const contentLength = response.headers.get('content-length')
  let errorBody: unknown = { message: 'Unknown error' }

  if (contentLength !== '0') {
    // Check content-type before parsing to avoid JSON parse errors on HTML error pages
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      try {
        errorBody = await response.json()
      } catch {
        // JSON parse failed, use default
      }
    }
  }

  const body = errorBody as Record<string, unknown>
  const message = typeof body.message === 'string'
    ? body.message
    : typeof body.error === 'string'
      ? body.error
      : 'API request failed'
  const fieldErrors = normalizeFieldErrors(errorBody)

  // Extract metadata from external API responses (e.g., retryAfter from 429)
  const metadata = body.metadata as ApiErrorMetadata | undefined
  const code = typeof body.code === 'string' ? body.code : undefined

  // Extract errors string[] (e.g., booking validation errors from BookingValidationService)
  const errors = Array.isArray(body.errors) && body.errors.every((e) => typeof e === 'string')
    ? (body.errors as string[])
    : undefined

  throw new ApiError(response.status, message, fieldErrors, metadata, code, errors)
}

/**
 * Metadata from external API error responses
 */
export interface ApiErrorMetadata {
  retryAfter?: number
  provider?: string
  timestamp?: string
}

export class ApiError extends Error {
  public fieldErrors?: ServerFieldError[]
  public metadata?: ApiErrorMetadata
  public code?: string
  public errors?: string[]

  constructor(
    public status: number,
    message: string,
    fieldErrors?: ServerFieldError[],
    metadata?: ApiErrorMetadata,
    code?: string,
    errors?: string[],
  ) {
    super(message)
    this.name = 'ApiError'
    this.fieldErrors = fieldErrors
    this.metadata = metadata
    this.code = code
    this.errors = errors
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`
  const authHeaders = await getAuthHeaders()

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  })

  if (!response.ok) {
    await handleErrorResponse(response)
  }

  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }

  return response.json()
}

/**
 * Fetch API for FormData (multipart/form-data uploads)
 * Does not set Content-Type header (browser sets it with boundary)
 */
export async function fetchApiFormData<T>(
  endpoint: string,
  formData: FormData,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`
  const authHeaders = await getAuthHeaders()

  const response = await fetch(url, {
    ...options,
    method: options?.method || 'POST',
    body: formData,
    headers: {
      ...authHeaders,
      ...options?.headers,
    },
    // Don't set Content-Type - browser will set it with boundary
  })

  if (!response.ok) {
    await handleErrorResponse(response)
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }

  return response.json()
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: RequestInit) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  postFormData: <T>(endpoint: string, formData: FormData, options?: RequestInit) =>
    fetchApiFormData<T>(endpoint, formData, { ...options, method: 'POST' }),

  put: <T>(endpoint: string, data?: unknown, options?: RequestInit) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: RequestInit) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    fetchApi<T>(endpoint, { ...options, method: 'DELETE' }),
}
