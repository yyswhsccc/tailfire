import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    await serviceFetch('/consumer-activity', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return new Response(null, { status: 204 })
  } catch {
    // Silently fail — tracking errors must never surface to consumers
    return new Response(null, { status: 204 })
  }
}
