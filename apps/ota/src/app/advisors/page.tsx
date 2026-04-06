import type { Metadata } from "next";
import { Suspense } from "react";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import { AdvisorDirectoryCard } from "@/components/advisor/advisor-directory-card";
import { AdvisorDirectoryFilters } from "@/components/advisor/advisor-directory-filters";

export const revalidate = 3600; // ISR: revalidate every hour

export function generateMetadata(): Metadata {
  return {
    title: "Our Travel Advisors | Phoenix Voyages",
    description:
      "Browse our team of expert travel advisors. Filter by specialty or language to find the perfect advisor to craft your next journey.",
    openGraph: {
      title: "Our Travel Advisors | Phoenix Voyages",
      description:
        "Browse our team of expert travel advisors. Filter by specialty or language to find the perfect advisor to craft your next journey.",
    },
  };
}

interface AdvisorsPageProps {
  searchParams: Promise<{ specialty?: string; language?: string }>;
}

async function fetchAdvisors(
  specialty?: string,
  language?: string,
): Promise<AdvisorProfile[]> {
  try {
    const params = new URLSearchParams();
    if (specialty) params.set("specialty", specialty);
    if (language) params.set("language", language);
    const qs = params.toString();

    return await publicFetch<AdvisorProfile[]>(
      `/advisor-profiles${qs ? `?${qs}` : ""}`,
      { next: { tags: ["advisors"] } },
    );
  } catch (error) {
    console.warn('[Advisors] Fetch failed:', (error as Error)?.message || 'unknown error');
    return [];
  }
}

export default async function AdvisorsPage({ searchParams }: AdvisorsPageProps) {
  const { specialty, language } = await searchParams;
  const advisors = await fetchAdvisors(specialty, language);

  const hasActiveFilters = Boolean(specialty || language);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          OUR TRAVEL ADVISORS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Expert advisors ready to craft your perfect journey
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8">
        <Suspense fallback={null}>
          <AdvisorDirectoryFilters />
        </Suspense>
      </div>

      {advisors.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium text-[#1A1A1A]">
            No advisors found
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting your filters — we may have the perfect advisor for you."
              : "Check back soon — our team is growing."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {advisors.map((advisor) => (
            <AdvisorDirectoryCard key={advisor.id} advisor={advisor} />
          ))}
        </div>
      )}
    </div>
  );
}
