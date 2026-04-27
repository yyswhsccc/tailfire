import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await serviceFetch('/consumer-auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return Response.json(result)
  } catch (error) {
    const status = (error as any)?.status || 500
    const message = (error as any)?.body?.message || 'Registration failed'
    return Response.json({ message }, { status })
  }
}
