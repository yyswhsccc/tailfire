import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * DELETE /api/trip-requests/:id/components/:cid — Remove a component from the trip request.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  try {
    const { id, cid } = await params;
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/components/${cid}`,
      { method: "DELETE" },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to remove component" },
      { status: 502 },
    );
  }
}
