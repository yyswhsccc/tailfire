import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * POST /api/trip-requests — Create a draft trip request.
 */
export async function POST(request: Request) {
  try {
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
