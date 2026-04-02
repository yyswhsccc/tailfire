import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";
import { validateTripAccess } from "@/app/api/trip-requests/validate-access";

/**
 * POST /api/trip-requests/:id/components/add — Append a component to the trip request.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await validateTripAccess(id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const body = await request.json();
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/components/add`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to add component" },
      { status: 502 },
    );
  }
}
