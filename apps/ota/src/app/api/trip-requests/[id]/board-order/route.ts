import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

/**
 * PATCH /api/trip-requests/:id/board-order — Update the board order of components.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = await serviceFetch<unknown>(
      `/ota/trip-requests/${id}/board-order`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to update board order" },
      { status: 502 },
    );
  }
}
