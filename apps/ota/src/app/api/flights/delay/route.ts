import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const data = await serviceFetch<unknown>(`/ota/search/flight-delay?${searchParams}`);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ prediction: null });
  }
}
