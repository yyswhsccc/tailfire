import { cookies } from 'next/headers'
import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get('ota_session')?.value
    if (!sessionId) return new Response(null, { status: 204 })

    const body = await request.json()
    await serviceFetch('/consumer-activity', {
      method: 'POST',
      body: JSON.stringify({ ...body, sessionId }),
    })
    return new Response(null, { status: 204 })
  } catch (err) {
    // B13: must NOT surface errors to consumers (analytics ingest), but we DO
    // want failures captured in Vercel logs so a regression isn't invisible.
    // OTA does not currently have Sentry wired (CLAUDE.md notes Sentry is in
    // API + admin only), so console.warn is the best breadcrumb available.
    // eslint-disable-next-line no-console
    console.warn('[consumer-activity] tracking POST failed:', (err as Error)?.message)
    return new Response(null, { status: 204 })
  }
}
