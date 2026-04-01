import { cookies } from "next/headers";
import { serviceFetch } from "@/lib/api";

/**
 * Validate that the calling session owns the given trip request.
 * Reads the `ota_session` cookie and compares it to the request's sessionId.
 * Returns false if no session cookie or if sessionId doesn't match.
 */
export async function validateTripAccess(
  requestId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("ota_session")?.value;
  if (!sessionId) return false;

  try {
    const request = await serviceFetch<{ sessionId: string | null }>(
      `/ota/trip-requests/${requestId}`,
    );
    return request.sessionId === sessionId;
  } catch {
    return false;
  }
}
