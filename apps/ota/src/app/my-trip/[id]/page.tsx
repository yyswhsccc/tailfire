import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { serviceFetch } from "@/lib/api";
import { DreamBoard } from "@/components/trip-builder/dream-board";

export const metadata: Metadata = {
  title: "My Trip | Phoenix Voyages",
  description: "Your dream trip board",
};

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
      // Verify ownership
      if (tripRequest.sessionId !== sessionId) {
        notFound();
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
