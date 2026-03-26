/**
 * ISR Revalidation Webhook
 *
 * Receives POST requests from the NestJS API to invalidate ISR-cached pages
 * when deal or advisor data changes. Supports tag-based and path-based
 * revalidation.
 *
 * Auth: shared REVALIDATION_SECRET (not public).
 */

import { revalidateTag, revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { tag?: string; path?: string; secret?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { tag, path, secret } = body;

  // Validate secret
  if (!secret || secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  // Must provide at least one of tag or path
  if (!tag && !path) {
    return NextResponse.json(
      { error: "Must provide tag or path" },
      { status: 400 },
    );
  }

  // Revalidate by tag or path (or both)
  if (tag) {
    revalidateTag(tag);
  }
  if (path) {
    revalidatePath(path);
  }

  return NextResponse.json({
    revalidated: true,
    tag: tag ?? null,
    path: path ?? null,
    now: Date.now(),
  });
}
