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
  } catch {
    // Silently fail — tracking errors must never surface to consumers
    return new Response(null, { status: 204 })
  }
}
