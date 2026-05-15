import type { Metadata } from "next";
import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { catalogFetch } from "@/lib/api";
import { TourProductCard } from "@/components/cards/tour-product-card";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import { SearchPageShell } from "@/components/search/search-page-shell";
import { TourSearchForm } from "@/components/search/tour-search-form";
import ToursLoading from "./loading";

export const metadata: Metadata = {
  title: "Browse Tours | Phoenix Voyages",
  description:
    "Explore guided tours and escorted travel packages worldwide. Our advisors will build the perfect itinerary for your group. Request a quote today.",
  openGraph: {
    title: "Browse Tours | Phoenix Voyages",
    description:
      "Explore guided tours and escorted travel packages worldwide. Expert advisors, personalized itineraries.",
  },
};

// ============================================================================
// TYPES
// ============================================================================

/** Matches TourSummaryDto from tour-repository API */
interface Tour {
  id: string;
  name: string;
  provider?: string;
  providerIdentifier?: string;
  operatorCode: string;
  season?: string;
  days?: number;
  nights?: number;
  description?: string;
  imageUrl?: string;
  lowestPriceCents?: number;
  departureCount?: number;
}

interface TourSearchResponse {
  tours: Tour[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

interface SearchParams {
  q?: string;
  page?: string;
}

function hasSearchFilters(params: SearchParams): boolean {
  return !!params.q;
}

function buildSearchQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", params.page);
  qs.set("pageSize", "20");
  return qs.toString();
}

async function fetchTours(params: SearchParams): Promise<TourSearchResponse | null> {
  try {
    const query = buildSearchQuery(params);
    return await catalogFetch<TourSearchResponse>(
      `/tour-repository/tours?${query}`,
      { next: { revalidate: 3600 } },
    );
  } catch (error) {
    console.warn('[ToursSearch] Fetch failed:', (error as Error)?.message || 'unknown error');
    return null;
  }
}

// ============================================================================
// PAGE
// ============================================================================

interface ToursPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ToursPage({ searchParams }: ToursPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  const tours = await fetchTours(params);

  return (
    <SearchPageShell productType="tours">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
            {hasFilters ? "TOUR RESULTS" : "BROWSE TOURS"}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            {hasFilters
              ? `Showing tours matching "${params.q}"`
              : "Guided tours and escorted travel packages — all quoted by a Phoenix Voyages advisor"}
          </p>
        </div>

        {/* Simple keyword search form */}
        <div className={hasFilters ? "mb-6" : "mb-12"}>
          <TourSearchForm currentQ={params.q ?? ""} />
        </div>

        {/* Advisor routing notice */}
        <div className="mb-6 rounded-2xl border border-[#C59746]/30 bg-[#C59746]/5 px-5 py-4 text-sm text-[#1A1A1A]">
          <p className="font-semibold">Tours are advisor-quoted</p>
          <p className="mt-0.5 text-muted-foreground">
            We don&apos;t display tour prices online — they vary by departure date, group size, and
            rooming. Our advisors provide accurate, no-surprise quotes.
          </p>
        </div>

        {/* Results section */}
        {tours === null ? (
          <ErrorState />
        ) : (
          <Suspense fallback={<ToursLoading />}>
            <TourResults tours={tours} hasFilters={hasFilters} currentPage={Number(params.page) || 1} searchParams={params} />
          </Suspense>
        )}
      </div>
    </SearchPageShell>
  );
}

// ============================================================================
// RESULTS SUB-COMPONENT
// ============================================================================

function TourResults({
  tours: response,
  hasFilters,
  currentPage,
  searchParams,
}: {
  tours: TourSearchResponse;
  hasFilters: boolean;
  currentPage: number;
  searchParams: SearchParams;
}) {
  const { tours: items, total, totalPages } = response;

  if (items.length === 0 && hasFilters) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No tours match your search</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try a different keyword, or{" "}
          <a href="/contact" className="font-medium text-[#C59746] hover:underline">
            contact an advisor
          </a>{" "}
          to build a custom itinerary.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No tours available right now</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Check back soon — new tours are added regularly.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Results count */}
      <div className="mb-4">
        <SearchResultsHeader
          count={total ?? items.length}
          noun="tours"
        />
      </div>

      {/* Result cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((tour) => (
          <TourProductCard
            key={tour.id}
            id={tour.id}
            name={tour.name}
            operatorName={tour.operatorCode ?? "Phoenix Voyages"}
            operatorCode={tour.operatorCode}
            durationDays={tour.days ?? 0}
            imageUrl={tour.imageUrl ?? null}
            priceCents={tour.lowestPriceCents ?? null}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <TourPagination
          currentPage={currentPage}
          totalPages={totalPages}
          searchParams={searchParams}
        />
      )}
    </>
  );
}

// ============================================================================
// PAGINATION
// ============================================================================

function TourPagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: SearchParams;
}) {
  const pages: number[] = [];
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    pages.push(i);
  }

  function buildPageHref(page: number): string {
    const p = new URLSearchParams();
    if (searchParams.q) p.set("q", searchParams.q);
    p.set("page", String(page));
    return `/search/tours?${p.toString()}`;
  }

  return (
    <nav
      aria-label="Tour search pagination"
      className="mt-8 flex items-center justify-center gap-1"
    >
      {currentPage > 1 && (
        <a
          href={buildPageHref(currentPage - 1)}
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100"
        >
          Previous
        </a>
      )}
      {pages.map((p) => (
        <a
          key={p}
          href={buildPageHref(p)}
          className={
            p === currentPage
              ? "inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-[#1A1A1A] px-3 text-sm font-semibold text-white"
              : "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100"
          }
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p}
        </a>
      ))}
      {currentPage < totalPages && (
        <a
          href={buildPageHref(currentPage + 1)}
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100"
        >
          Next
        </a>
      )}
    </nav>
  );
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium text-[#1A1A1A]">Unable to load tours right now</p>
      <p className="mt-2 text-sm text-muted-foreground">Please try again later.</p>
      <a
        href="/search/tours"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-100"
      >
        <RefreshCw className="size-4" />
        Try Again
      </a>
    </div>
  );
}
