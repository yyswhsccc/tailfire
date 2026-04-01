import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * GET /api/trip-requests/by-session/:sid — Fetch trip request by session ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  try {
    const { sid } = await params;
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/by-session/${sid}`,
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch trip request by session" },
      { status: 502 },
    );
  }
}
