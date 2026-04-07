import { NextResponse } from 'next/server'
import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const data = await serviceFetch<unknown>('/ota/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        phone: body.phone || undefined,
        message: body.message || undefined,
        source: 'advisor_inquiry',
        advisorSlug: body.advisorSlug || undefined,
      }),
    })

    return NextResponse.json(data)
  } catch (error) {
    console.warn('[api/leads] Proxy failed:', (error as Error)?.message)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 502 })
  }
}
