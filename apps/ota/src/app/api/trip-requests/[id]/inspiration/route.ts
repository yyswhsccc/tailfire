import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * POST /api/trip-requests/:id/inspiration — Fetch inspiration for the trip request.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/inspiration`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch inspiration" },
      { status: 502 },
    );
  }
}
