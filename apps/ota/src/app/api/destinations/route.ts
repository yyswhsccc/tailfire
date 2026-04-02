import { NextResponse } from 'next/server'
import { publicFetch } from '@/lib/api'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  try {
    const data = await publicFetch(`/destinations?${searchParams}`, { cache: 'no-store' })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ destinations: [], total: 0, page: 1, pageSize: 24, totalPages: 0 })
  }
}
