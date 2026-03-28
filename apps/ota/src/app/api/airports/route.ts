import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");

  if (!keyword || keyword.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const airports = await serviceFetch<
      { code: string; name: string; city: string; country: string }[]
    >(`/ota/search/airports?keyword=${encodeURIComponent(keyword)}`);
    return NextResponse.json(airports);
  } catch {
    return NextResponse.json([]);
  }
}
