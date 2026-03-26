import type { Metadata } from "next";
import { Suspense } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";

import { serviceFetch } from "@/lib/api";
import { FlightSearchForm } from "@/components/search/flight-search-form";
import { FlightResultCard, type FlightOffer } from "@/components/search/flight-result-card";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import FlightsLoading from "./loading";

export const metadata: Metadata = {
  title: "Search Flights | Phoenix Voyages",
  description:
    "Search and compare flights worldwide. Economy, business, and first class options from hundreds of airlines. Expert travel advice from Phoenix Voyages advisors.",
  openGraph: {
    title: "Search Flights | Phoenix Voyages",
    description:
      "Search and compare flights worldwide. Economy, business, and first class options.",
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface FlightSearchResponse {
  data: FlightOffer[];
  meta?: {
    count: number;
    links?: Record<string, string>;
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

interface SearchParams {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: string;
  children?: string;
  travelClass?: string;
}

function hasSearchFilters(params: SearchParams): boolean {
  return !!(params.origin && params.destination && params.departureDate);
}

function buildSearchQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.origin) qs.set("origin", params.origin);
  if (params.destination) qs.set("destination", params.destination);
  if (params.departureDate) qs.set("departureDate", params.departureDate);
  if (params.returnDate) qs.set("returnDate", params.returnDate);
  if (params.adults) qs.set("adults", params.adults);
  if (params.children && params.children !== "0") qs.set("children", params.children);
  if (params.travelClass) qs.set("travelClass", params.travelClass);
  return qs.toString();
}

async function fetchFlights(params: SearchParams): Promise<FlightSearchResponse | null> {
  try {
    const query = buildSearchQuery(params);
    return await serviceFetch<FlightSearchResponse>(`/ota/search/flights?${query}`);
  } catch (error) {
    console.error("Failed to fetch flights:", error);
    return null;
  }
}

// ============================================================================
// PAGE
// ============================================================================

interface FlightsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function FlightsPage({ searchParams }: FlightsPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  const flights = hasFilters ? await fetchFlights(params) : null;
  const fetchFailed = hasFilters && flights === null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          {hasFilters ? "FLIGHT RESULTS" : "SEARCH FLIGHTS"}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {hasFilters
            ? "Comparing fares for your route"
            : "Find the best fares from hundreds of airlines worldwide"}
        </p>
      </div>

      {/* Search form */}
      <div className={hasFilters ? "mb-6" : "mb-12"}>
        <FlightSearchForm compact={hasFilters} />
      </div>

      {/* Results section */}
      {fetchFailed ? (
        <ErrorState />
      ) : flights ? (
        <Suspense fallback={<FlightsLoading />}>
          <FlightResults flights={flights} />
        </Suspense>
      ) : (
        <EmptyPrompt />
      )}
    </div>
  );
}

// ============================================================================
// RESULTS SUB-COMPONENT
// ============================================================================

function FlightResults({ flights }: { flights: FlightSearchResponse }) {
  const { data } = flights;

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No flights found for this route</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your dates, destination, or passenger count.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Results count */}
      <div className="mb-4">
        <SearchResultsHeader count={data.length} noun="flights" />
      </div>

      {/* Amadeus latency notice */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Flight availability is live from Amadeus — prices and seats may change.
          Our advisors can lock in the best fare for you.
        </p>
      </div>

      {/* Result cards */}
      <div className="space-y-4">
        {data.map((offer) => (
          <FlightResultCard key={offer.id} offer={offer} />
        ))}
      </div>
    </>
  );
}

// ============================================================================
// EMPTY PROMPT (before search)
// ============================================================================

function EmptyPrompt() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium text-[#1A1A1A]">Enter your route above to see fares</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Provide origin, destination, and departure date to search live availability.
      </p>
    </div>
  );
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium text-[#1A1A1A]">Unable to fetch flights right now</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The flight search service may be slow or temporarily unavailable. Please try again.
      </p>
      <a
        href="/search/flights"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-100"
      >
        <RefreshCw className="size-4" />
        Try Again
      </a>
    </div>
  );
}
