import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * Proxy flight search requests from the client to the backend API.
 * Client components can't access server-side env vars (API_URL, OTA_SERVICE_KEY),
 * so they call this route instead of serviceFetch directly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();

  try {
    const data = await serviceFetch<unknown>(`/ota/search/flights?${qs}`);
    return NextResponse.json(data);
  } catch (error) {
    console.warn('[api/flights/search] Proxy failed:', (error as Error)?.message || 'unknown error');
    return NextResponse.json({ results: [], warning: "Search temporarily unavailable" }, { status: 502 });
  }
}
