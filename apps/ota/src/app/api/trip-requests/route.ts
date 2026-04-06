import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";
import { tripRequestRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/trip-requests — Create a draft trip request.
 */
export async function POST(request: Request) {
  try {
    // -------------------------------------------------------------------------
    // Body size guard — reject payloads larger than 1 MB
    // -------------------------------------------------------------------------
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1_000_000) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }

    // -------------------------------------------------------------------------
    // Rate limiting — no-op when Upstash is not configured (local dev)
    // -------------------------------------------------------------------------
    if (tripRequestRateLimit) {
      const ip =
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        "unknown";
      const { success } = await tripRequestRateLimit.limit(ip);
      if (!success) {
        return Response.json({ error: "Too many requests" }, { status: 429 });
      }
    }

    const body = await request.json();
    const data = await serviceFetch<unknown>("/ota/trip-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to create trip request" },
      { status: 502 },
    );
  }
}
