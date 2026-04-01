import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * POST /api/trip-requests/:id/submit — Submit the trip request and promote to trip.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/submit`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to submit trip request" },
      { status: 502 },
    );
  }
}
