import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

    // Validate that the caller's ota_session cookie matches the requested session
    const cookieStore = await cookies();
    const callerSession = cookieStore.get("ota_session")?.value;
    if (callerSession !== sid) {
      return NextResponse.json([], { status: 200 }); // Empty array, don't reveal existence
    }

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
