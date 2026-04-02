import { cookies } from "next/headers";
import { serviceFetch } from "@/lib/api";

/**
 * Validate that the caller owns the given trip request.
 *
 * Two checks (either grants access):
 *   1. Session cookie (`ota_session`) matches the request's sessionId.
 *   2. Supabase auth user's contact_id matches the request's contactId.
 *
 * Returns false if neither check passes or if the request doesn't exist.
 */
export async function validateTripAccess(
  requestId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("ota_session")?.value;

  try {
    const request = await serviceFetch<{
      sessionId: string | null;
      contactId: string | null;
    }>(`/ota/trip-requests/${requestId}`);

    // Check 1: session cookie match
    if (sessionId && request.sessionId === sessionId) return true;

    // Check 2: contact_id match via Supabase auth
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const contactId =
        user?.user_metadata?.contact_id || user?.app_metadata?.contact_id;
      if (contactId && request.contactId === contactId) return true;
    } catch {
      // No Supabase auth available — that's fine, session check is primary
    }

    return false;
  } catch {
    return false;
  }
}
