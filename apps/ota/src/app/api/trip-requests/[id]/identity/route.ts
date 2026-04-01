import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * PATCH /api/trip-requests/:id/identity — Link an identity to the trip request.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/identity`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to link identity" },
      { status: 502 },
    );
  }
}
