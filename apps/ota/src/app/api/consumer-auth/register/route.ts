import { serviceFetch } from '@/lib/api'

/**
 * Pull the real client IP from the incoming request headers. Vercel sets both
 * `x-forwarded-for` and `x-real-ip`. Cloudflare also sets `cf-connecting-ip`.
 * We forward whichever comes first so the API's per-IP throttler keys on the
 * actual visitor, not on this serverless function's IP.
 */
function getClientIp(request: Request): string | null {
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Map OTA field names to API DTO field names. B2 rework (Codex 2026-05-15):
    // turnstileToken MUST be forwarded — without it, with TURNSTILE_REQUIRED=true
    // every real OTA registration fails 400 at the API.
    const payload = {
      email: body.email,
      firstName: body.firstName,
      sessionId: body.sessionId,
      advisorSlug: body.advisorSlug,
      turnstileToken: body.turnstileToken,
    }

    // B2 rework: forward the visitor's IP so the API's per-IP throttler
    // (5/min) tracks individual users instead of collapsing every OTA
    // request onto this Vercel function's source IP.
    const clientIp = getClientIp(request)
    const forwardedHeaders: Record<string, string> = {}
    if (clientIp) {
      forwardedHeaders['x-forwarded-for'] = clientIp
    }

    const result = await serviceFetch('/consumer-auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: forwardedHeaders,
    })
    return Response.json(result)
  } catch (error) {
    const status = (error as { status?: number })?.status || 500
    const message =
      (error as { body?: { message?: string } })?.body?.message || 'Registration failed'
    return Response.json({ message }, { status })
  }
}
