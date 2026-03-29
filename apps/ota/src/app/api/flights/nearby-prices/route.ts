import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * Proxy nearby date price requests from the client to the backend API.
 * GET /api/flights/nearby-prices?origin=YOW&destination=CUN&departureDate=2026-04-15&adults=1&travelClass=ECONOMY
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const data = await serviceFetch<unknown>(
      `/ota/search/flight-nearby-prices?${searchParams}`,
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ prices: [] });
  }
}
