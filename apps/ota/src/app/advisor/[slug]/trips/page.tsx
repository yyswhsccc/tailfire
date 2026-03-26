import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import type { PublishedTrip } from "@/types/published-trip";
import { AdvisorContextBar } from "@/components/advisor/advisor-context-bar";
import { TripShowcaseCard } from "@/components/advisor/trip-showcase-card";

export const revalidate = 3600; // ISR: revalidate every hour

interface AdvisorTripsPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchAdvisor(slug: string): Promise<AdvisorProfile | null> {
  try {
    return await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
      { next: { tags: ["advisors", `advisor-${slug}`] } },
    );
  } catch {
    return null;
  }
}

async function fetchAdvisorTrips(slug: string): Promise<PublishedTrip[]> {
  try {
    return await publicFetch<PublishedTrip[]>(
      `/advisor-profiles/by-slug/${slug}/published-trips`,
      { next: { tags: [`advisor-${slug}-trips`] } },
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: AdvisorTripsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const advisor = await fetchAdvisor(slug);

  if (!advisor) {
    return { title: "Advisor Not Found | Phoenix Voyages" };
  }

  const firstName = advisor.displayName.split(" ")[0];
  const title = `${firstName}'s Curated Trips — ${advisor.displayName} | Phoenix Voyages`;
  const description = `Explore travel itineraries published by ${advisor.displayName}, a Phoenix Voyages travel advisor.${
    advisor.specialties?.length
      ? ` Specialising in ${advisor.specialties.slice(0, 3).join(", ")}.`
      : ""
  }`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/advisor/${advisor.slug}/trips`,
    },
  };
}

export default async function AdvisorTripsPage({
  params,
}: AdvisorTripsPageProps) {
  const { slug } = await params;

  const [advisor, trips] = await Promise.all([
    fetchAdvisor(slug),
    fetchAdvisorTrips(slug),
  ]);

  if (!advisor) {
    notFound();
  }

  const firstName = advisor.displayName.split(" ")[0];

  return (
    <div className="min-h-screen bg-white">
      {/* Advisor context bar */}
      <AdvisorContextBar advisor={advisor} />

      {/* Page header */}
      <section className="border-b border-border px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
            {firstName}&apos;s Curated Trips
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Itineraries personally crafted and published by{" "}
            {advisor.displayName}
          </p>
        </div>
      </section>

      {/* Trips grid */}
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {trips.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <TripShowcaseCard
                  key={trip.id}
                  trip={trip}
                  advisorSlug={advisor.slug}
                  advisorName={advisor.displayName}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-20 text-center">
              <p className="text-lg font-semibold text-[#1A1A1A]">
                No trips published yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {advisor.displayName} hasn&apos;t published any trips yet. Check
                back soon or browse available deals.
              </p>
              <Link
                href={`/advisor/${advisor.slug}/deals`}
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
              >
                Browse {firstName}&apos;s Deals
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-[#faf6f0] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-xl font-bold text-[#1A1A1A]">
            Ready to start planning?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {firstName} can tailor any of these itineraries to fit your travel
            style, dates, and budget. Get in touch to make it happen.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/advisor/${advisor.slug}#contact`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:w-auto"
            >
              Contact {firstName}
            </Link>
            <Link
              href={`/advisor/${advisor.slug}`}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-gray-50 sm:w-auto"
            >
              View Profile
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
