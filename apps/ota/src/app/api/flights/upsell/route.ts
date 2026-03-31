import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await serviceFetch<unknown>("/ota/search/flight-upsell", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ alternatives: [] });
  }
}
