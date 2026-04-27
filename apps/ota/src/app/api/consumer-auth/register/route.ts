import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Map OTA field names to API DTO field names
    const payload = {
      email: body.email,
      firstName: body.firstName,
      sessionId: body.sessionId,
      advisorSlug: body.advisorSlug,
    }
    const result = await serviceFetch('/consumer-auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return Response.json(result)
  } catch (error) {
    const status = (error as any)?.status || 500
    const message = (error as any)?.body?.message || 'Registration failed'
    return Response.json({ message }, { status })
  }
}
