import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await serviceFetch<unknown>("/ota/leads/flight-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to submit flight request" },
      { status: 502 },
    );
  }
}
