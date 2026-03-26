import type { Metadata } from "next";
import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { catalogFetch } from "@/lib/api";
import { CruiseSearchForm } from "@/components/search/cruise-search-form";
import { CruiseResultCard, type CruiseSailing } from "@/components/search/cruise-result-card";
import { FilterChips, type FilterChipOption } from "@/components/search/filter-chips";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import CruisesLoading from "./loading";

export const metadata: Metadata = {
  title: "Search Cruises | Phoenix Voyages",
  description:
    "Browse hundreds of cruise sailings worldwide. Compare prices, dates, and itineraries from top cruise lines. Expert cruise advice from Phoenix Voyages advisors.",
  openGraph: {
    title: "Search Cruises | Phoenix Voyages",
    description:
      "Browse hundreds of cruise sailings worldwide. Compare prices, dates, and itineraries.",
  },
};

// ============================================================================
// TYPES (matching API response DTOs)
// ============================================================================

interface FilterOption {
  id: string;
  name: string;
  count?: number;
}

interface SailingSearchResponse {
  items: CruiseSailing[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
  sync: {
    syncInProgress: boolean;
    pricesUpdating: boolean;
    lastSyncedAt: string | null;
  };
  filters: Record<string, unknown>;
}

interface FiltersResponse {
  cruiseLines: FilterOption[];
  ships: FilterOption[];
  regions: FilterOption[];
  embarkPorts: FilterOption[];
  disembarkPorts: FilterOption[];
  portsOfCall: FilterOption[];
  dateRange: { min: string | null; max: string | null };
  nightsRange: { min: number | null; max: number | null };
  priceRange: { min: number | null; max: number | null };
}

// ============================================================================
// SORT CHIP OPTIONS
// ============================================================================

const SORT_OPTIONS: FilterChipOption[] = [
  { label: "Best Match", value: "", paramKey: "sortBy" },
  { label: "Price: Low", value: "price", paramKey: "sortBy" },
  { label: "Duration", value: "nights", paramKey: "sortBy" },
  { label: "Departure", value: "sailDate", paramKey: "sortBy" },
];

// ============================================================================
// DATA FETCHING
// ============================================================================

interface SearchParams {
  q?: string;
  cruiseLineId?: string;
  regionId?: string;
  sailDateFrom?: string;
  sailDateTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
}

function hasSearchFilters(params: SearchParams): boolean {
  return !!(params.q || params.cruiseLineId || params.regionId || params.sailDateFrom);
}

function buildSearchQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.cruiseLineId) qs.set("cruiseLineId", params.cruiseLineId);
  if (params.regionId) qs.set("regionId", params.regionId);
  if (params.sailDateFrom) qs.set("sailDateFrom", params.sailDateFrom);
  if (params.sailDateTo) qs.set("sailDateTo", params.sailDateTo);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (params.page) qs.set("page", params.page);
  qs.set("pageSize", "20");
  return qs.toString();
}

async function fetchSailings(params: SearchParams): Promise<SailingSearchResponse | null> {
  try {
    const query = buildSearchQuery(params);
    return await catalogFetch<SailingSearchResponse>(
      `/cruise-repository/sailings?${query}`,
      { next: { revalidate: 3600 } },
    );
  } catch (error) {
    console.error("Failed to fetch sailings:", error);
    return null;
  }
}

async function fetchFilters(): Promise<FiltersResponse | null> {
  try {
    return await catalogFetch<FiltersResponse>("/cruise-repository/filters", {
      next: { revalidate: 3600 },
    });
  } catch (error) {
    console.error("Failed to fetch cruise filters:", error);
    return null;
  }
}

// ============================================================================
// PAGE
// ============================================================================

interface CruisesPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function CruisesPage({ searchParams }: CruisesPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  // Fetch filters always (for the form dropdowns), sailings only when searching
  const [filters, sailings] = await Promise.all([
    fetchFilters(),
    hasFilters ? fetchSailings(params) : fetchSailings({}),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          {hasFilters ? "CRUISE RESULTS" : "SEARCH CRUISES"}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {hasFilters
            ? "Browse sailings matching your criteria"
            : "Find your perfect cruise from hundreds of sailings worldwide"}
        </p>
      </div>

      {/* Search form */}
      <div className={hasFilters ? "mb-6" : "mb-12"}>
        <CruiseSearchForm
          cruiseLines={filters?.cruiseLines ?? []}
          regions={filters?.regions ?? []}
          compact={hasFilters}
        />
      </div>

      {/* Results section */}
      {sailings === null ? (
        <ErrorState />
      ) : (
        <Suspense fallback={<CruisesLoading />}>
          <CruiseResults
            sailings={sailings}
            hasFilters={hasFilters}
            currentPage={Number(params.page) || 1}
            searchParams={params}
          />
        </Suspense>
      )}
    </div>
  );
}

// ============================================================================
// RESULTS SUB-COMPONENT
// ============================================================================

function CruiseResults({
  sailings,
  hasFilters,
  currentPage,
  searchParams,
}: {
  sailings: SailingSearchResponse;
  hasFilters: boolean;
  currentPage: number;
  searchParams: SearchParams;
}) {
  const { items, pagination } = sailings;

  if (items.length === 0 && hasFilters) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No cruises match your search</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your filters or search for a different destination.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No cruises available</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Check back soon — new sailings are added regularly.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Sort chips + results count */}
      <div className="mb-4 space-y-3">
        <SearchResultsHeader count={pagination.totalItems} noun="cruises" />
        <FilterChips options={SORT_OPTIONS} basePath="/search/cruises" />
      </div>

      {/* Result cards */}
      <div className="space-y-4">
        {items.map((sailing) => (
          <CruiseResultCard key={sailing.id} sailing={sailing} />
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={pagination.totalPages}
          searchParams={searchParams}
        />
      )}
    </>
  );
}

// ============================================================================
// PAGINATION
// ============================================================================

function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: SearchParams;
}) {
  // Build page numbers to show: current +/- 2
  const pages: number[] = [];
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    pages.push(i);
  }

  function buildPageHref(page: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, String(value));
    }
    params.set("page", String(page));
    return `/search/cruises?${params.toString()}`;
  }

  return (
    <nav
      aria-label="Cruise search pagination"
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
      <p className="text-lg font-medium text-[#1A1A1A]">
        Unable to search cruises right now
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Please try again later.
      </p>
      <a
        href="/search/cruises"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-100"
      >
        <RefreshCw className="size-4" />
        Try Again
      </a>
    </div>
  );
}
