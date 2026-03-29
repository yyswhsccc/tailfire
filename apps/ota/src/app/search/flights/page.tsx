import type { Metadata } from "next";

import { serviceFetch } from "@/lib/api";
import { SearchPageShell } from "@/components/search/search-page-shell";
import { FlightSearchClient } from "@/components/flights/flight-search-client";
import type { FlightOffer } from "@/components/flights/flight-search-store";

// ============================================================================
// METADATA
// ============================================================================

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
  results: FlightOffer[];
  warning?: string;
}

interface SearchParams {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: string;
  children?: string;
  travelClass?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

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
  if (params.children && params.children !== "0")
    qs.set("children", params.children);
  if (params.travelClass) qs.set("travelClass", params.travelClass);
  return qs.toString();
}

async function fetchFlights(
  params: SearchParams,
): Promise<{ results: FlightOffer[]; error?: string }> {
  try {
    const query = buildSearchQuery(params);
    const data = await serviceFetch<FlightSearchResponse>(
      `/ota/search/flights?${query}`,
    );
    return { results: data.results ?? [] };
  } catch (error) {
    console.error("Failed to fetch flights:", error);
    return { results: [], error: "Failed to fetch flights" };
  }
}

// ============================================================================
// PAGE (Server Component)
// ============================================================================

interface FlightsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function FlightsPage({ searchParams }: FlightsPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  let initialResults: FlightOffer[] = [];
  let searchError: string | null = null;

  if (hasFilters) {
    const { results, error } = await fetchFlights(params);
    initialResults = results;
    searchError = error ?? null;
  }

  return (
    <SearchPageShell productType="flights">
      <FlightSearchClient
        initialResults={initialResults}
        searchError={searchError}
      />
    </SearchPageShell>
  );
}
