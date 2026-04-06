import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { serviceFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DreamBoard } from "@/components/trip-builder/dream-board";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params;
    const tripRequest = await serviceFetch<{ title?: string | null; components?: unknown[] }>(`/ota/trip-requests/${id}`);
    const title = tripRequest?.title ?? "My Trip";
    const count = tripRequest?.components?.length ?? 0;
    return {
      title: `${title} | Phoenix Voyages`,
      description: count > 0
        ? `${count} item${count !== 1 ? "s" : ""} in your dream board`
        : "Your dream trip board",
    };
  } catch {
    return {
      title: "My Trip | Phoenix Voyages",
      description: "Your dream trip board",
    };
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function MyTripPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  let tripRequest: any;
  let readOnly = false;

  if (token) {
    // Shared view — public, read-only
    try {
      tripRequest = await serviceFetch(`/ota/trip-requests/shared/${token}`);
      // Verify token resolves to the same row as the URL id
      if (tripRequest.id !== id) {
        notFound();
      }
      readOnly = true;
    } catch {
      notFound();
    }
  } else {
    // Owner view — verify session
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("ota_session")?.value;

    try {
      tripRequest = await serviceFetch(`/ota/trip-requests/${id}`);

      // Primary check: session cookie matches
      if (tripRequest.sessionId !== sessionId) {
        // Fallback: contact-based auth for identified users (e.g. different device)
        let contactAuthed = false;
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          const contactId =
            user?.user_metadata?.contact_id || user?.app_metadata?.contact_id;
          if (contactId && tripRequest.contactId === contactId) {
            contactAuthed = true;
          }
        } catch {
          // Supabase auth not available — fall through to notFound
        }

        if (!contactAuthed) {
          notFound();
        }
      }
    } catch {
      notFound();
    }
  }

  if (!tripRequest) notFound();

  return (
    <main className="min-h-screen bg-[#fafaf8]">
      <DreamBoard
        requestId={tripRequest.id}
        title={tripRequest.title}
        components={tripRequest.components || []}
        inspiration={tripRequest.inspiration || []}
        boardOrder={tripRequest.boardOrder || []}
        readOnly={readOnly}
        startDate={tripRequest.startDate}
        endDate={tripRequest.endDate}
        travelers={tripRequest.travelers}
      />
    </main>
  );
}
