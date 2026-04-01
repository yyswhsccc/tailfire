import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";
import { validateTripAccess } from "@/app/api/trip-requests/validate-access";

/**
 * POST /api/trip-requests/:id/share — Generate a share token for the trip request.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await validateTripAccess(id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/share`,
      { method: "POST" },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate share token" },
      { status: 502 },
    );
  }
}

/**
 * DELETE /api/trip-requests/:id/share — Revoke the share token.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await validateTripAccess(id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/share`,
      { method: "DELETE" },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to revoke share token" },
      { status: 502 },
    );
  }
}
