import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";
import { validateTripAccess } from "../validate-access";

/**
 * GET /api/trip-requests/:id — Fetch trip request details.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Ownership check: caller must own this trip request via session or contact
    if (!(await validateTripAccess(id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = await serviceFetch<unknown>(`/ota/trip-requests/${id}`);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch trip request" },
      { status: 502 },
    );
  }
}
