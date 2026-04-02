import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * GET /api/trip-requests/shared/:token — Fetch shared trip request view (public).
 * The backend strips sensitive fields before returning.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/shared/${token}`,
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch shared trip request" },
      { status: 502 },
    );
  }
}
