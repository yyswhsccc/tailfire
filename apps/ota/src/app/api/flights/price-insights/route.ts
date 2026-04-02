import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * Proxy SerpAPI flight price insights requests to the backend API.
 * GET /api/flights/price-insights?origin=YOW&destination=CUN&departureDate=2026-04-15
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const data = await serviceFetch<unknown>(
      `/ota/search/flight-price-insights?${searchParams}`,
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ insights: null });
  }
}
