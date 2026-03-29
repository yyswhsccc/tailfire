"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw, Search } from "lucide-react";

import { serviceFetch } from "@/lib/api";
import {
  applyFilters,
  sortFlights,
} from "@/lib/flight-utils";
import { useSearch } from "@/components/search/search-page-shell";

import {
  useFlightSearch,
  type FlightOffer,
  type PriceMetrics,
  type DirectDestination,
} from "./flight-search-store";
import { FlightSearchForm } from "./flight-search-form";
import { PriceCalendar } from "./price-calendar";
import { PriceDateStrip } from "./price-date-strip";
import { SavingsTip, PriceInsightBar, DirectFlightsBanner } from "./flight-insights";
import { RoundTripBar } from "./round-trip-bar";
import { FlightCard } from "./flight-card";
import { FlightSortPills } from "./flight-sort-pills";
import { FlightFilters } from "./flight-filters";
import { FlightFilterSheet } from "./flight-filter-sheet";
import { FlightConfirmation } from "./flight-confirmation";
import { FlightRequestForm } from "./flight-request-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlightSearchClientProps {
  initialResults: FlightOffer[];
  searchError?: string | null;
}

// ---------------------------------------------------------------------------
// EmptyPrompt
// ---------------------------------------------------------------------------

function EmptyPrompt() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <Search className="mx-auto mb-4 size-10 text-muted-foreground/60" />
      <p className="text-lg font-medium text-[#1A1A1A]">
        Enter your route above to see fares
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Provide origin, destination, and departure date to search live
        availability.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

function ErrorState() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <AlertCircle className="mx-auto mb-4 size-10 text-red-400" />
      <p className="text-lg font-medium text-[#1A1A1A]">
        Unable to fetch flights right now
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The flight search service may be slow or temporarily unavailable. Please
        try again.
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

// ---------------------------------------------------------------------------
// Client component
// ---------------------------------------------------------------------------

export function FlightSearchClient({
  initialResults,
  searchError,
}: FlightSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startSearch } = useSearch();
  const enrichmentFetchedRef = useRef(false);

  // ---- Store selectors ----------------------------------------------------
  const outboundResults = useFlightSearch((s) => s.outboundResults);
  const returnResults = useFlightSearch((s) => s.returnResults);
  const isSearching = useFlightSearch((s) => s.isSearching);
  const sort = useFlightSearch((s) => s.sort);
  const filters = useFlightSearch((s) => s.filters);
  const roundTripStep = useFlightSearch((s) => s.roundTripStep);
  const selectedOutbound = useFlightSearch((s) => s.selectedOutbound);
  const tripType = useFlightSearch((s) => s.tripType);
  const showRequestForm = useFlightSearch((s) => s.showRequestForm);
  const upsellOffers = useFlightSearch((s) => s.upsellOffers);

  // ---- Store setters ------------------------------------------------------
  const setSearchParams = useFlightSearch((s) => s.setSearchParams);
  const setTripType = useFlightSearch((s) => s.setTripType);
  const setOutboundResults = useFlightSearch((s) => s.setOutboundResults);
  const setReturnResults = useFlightSearch((s) => s.setReturnResults);
  const setIsSearching = useFlightSearch((s) => s.setIsSearching);
  const setSearchError = useFlightSearch((s) => s.setSearchError);
  const setRoundTripStep = useFlightSearch((s) => s.setRoundTripStep);
  const setPriceMetrics = useFlightSearch((s) => s.setPriceMetrics);
  const setPriceMetricsLoading = useFlightSearch((s) => s.setPriceMetricsLoading);
  const setDirectDestinations = useFlightSearch((s) => s.setDirectDestinations);
  const setDirectDestinationsLoading = useFlightSearch(
    (s) => s.setDirectDestinationsLoading,
  );
  const setUpsellOffers = useFlightSearch((s) => s.setUpsellOffers);
  const setUpsellLoading = useFlightSearch((s) => s.setUpsellLoading);
  const selectOutbound = useFlightSearch((s) => s.selectOutbound);
  const selectReturn = useFlightSearch((s) => s.selectReturn);

  // ---- URL params ---------------------------------------------------------
  const origin = searchParams.get("origin") ?? "";
  const destination = searchParams.get("destination") ?? "";
  const departureDate = searchParams.get("departureDate") ?? "";
  const returnDate = searchParams.get("returnDate") ?? "";
  const adults = parseInt(searchParams.get("adults") ?? "1", 10);
  const children = parseInt(searchParams.get("children") ?? "0", 10);
  const travelClass = searchParams.get("travelClass") ?? "ECONOMY";

  const hasSearch = !!(origin && destination && departureDate);

  // ---- 1. Sync URL -> Store on mount / URL change -------------------------
  useEffect(() => {
    if (!hasSearch) return;

    setSearchParams({
      origin,
      destination,
      departureDate,
      returnDate,
      adults,
      children,
      travelClass,
    });
    setTripType(returnDate ? "round-trip" : "one-way");
    setOutboundResults(initialResults);
    setSearchError(searchError ?? null);

    // Reset enrichment tracking on URL change so enrichments re-fetch
    enrichmentFetchedRef.current = false;
  }, [
    origin,
    destination,
    departureDate,
    returnDate,
    adults,
    children,
    travelClass,
    hasSearch,
    initialResults,
    searchError,
    setSearchParams,
    setTripType,
    setOutboundResults,
    setSearchError,
  ]);

  // ---- 2. Fetch enrichment data in parallel (non-blocking) ----------------
  useEffect(() => {
    if (!hasSearch || enrichmentFetchedRef.current) return;
    enrichmentFetchedRef.current = true;

    // Price metrics
    (async () => {
      try {
        setPriceMetricsLoading(true);
        const data = await serviceFetch<PriceMetrics>(
          `/ota/search/flight-price-metrics?origin=${origin}&destination=${destination}&departureDate=${departureDate}`,
        );
        setPriceMetrics(data);
      } catch {
        // Non-critical — silently degrade
      } finally {
        setPriceMetricsLoading(false);
      }
    })();

    // Direct destinations
    (async () => {
      try {
        setDirectDestinationsLoading(true);
        const data = await serviceFetch<DirectDestination[]>(
          `/ota/search/direct-destinations?airport=${origin}`,
        );
        setDirectDestinations(data);
      } catch {
        // Non-critical
      } finally {
        setDirectDestinationsLoading(false);
      }
    })();

    // Upsell offers (needs at least one result)
    if (initialResults.length > 0) {
      (async () => {
        try {
          setUpsellLoading(true);
          const data = await serviceFetch<FlightOffer[]>(
            "/ota/search/flight-upsell",
            {
              method: "POST",
              body: JSON.stringify({
                flightOffers: [initialResults[0]],
              }),
            },
          );
          setUpsellOffers(data);
        } catch {
          // Non-critical
        } finally {
          setUpsellLoading(false);
        }
      })();
    }
  }, [
    hasSearch,
    origin,
    destination,
    departureDate,
    initialResults,
    setPriceMetrics,
    setPriceMetricsLoading,
    setDirectDestinations,
    setDirectDestinationsLoading,
    setUpsellOffers,
    setUpsellLoading,
  ]);

  // ---- 3. Compute filtered/sorted results ---------------------------------
  const activeResults =
    roundTripStep === "return" ? returnResults : outboundResults;

  const filteredResults = useMemo(
    () => sortFlights(applyFilters(activeResults, filters), sort),
    [activeResults, filters, sort],
  );

  // ---- 4. Handle date select from calendar --------------------------------
  const handleDateSelect = useCallback(
    (date: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("departureDate", date);
      startSearch(() => router.push(`/search/flights?${params.toString()}`));
    },
    [searchParams, router, startSearch],
  );

  // ---- 5. Handle flight selection -----------------------------------------
  const handleFlightSelect = useCallback(
    async (offer: FlightOffer) => {
      if (tripType === "one-way") {
        selectOutbound(offer);
        setRoundTripStep("confirm");
        return;
      }

      // Round-trip: outbound step
      if (roundTripStep === "outbound") {
        selectOutbound(offer);

        // Fetch return flights
        setIsSearching(true);
        setReturnResults([]);
        try {
          const params = new URLSearchParams();
          // Swap origin/destination for return leg
          params.set("origin", destination);
          params.set("destination", origin);
          params.set("departureDate", returnDate);
          params.set("adults", String(adults));
          if (children > 0) params.set("children", String(children));
          params.set("travelClass", travelClass);

          const data = await serviceFetch<{ results: FlightOffer[] }>(
            `/ota/search/flights?${params.toString()}`,
          );
          setReturnResults(data.results ?? []);
        } catch {
          setSearchError("Failed to load return flights. Please try again.");
        } finally {
          setIsSearching(false);
        }
        return;
      }

      // Round-trip: return step
      if (roundTripStep === "return") {
        selectReturn(offer);
      }
    },
    [
      tripType,
      roundTripStep,
      origin,
      destination,
      returnDate,
      adults,
      children,
      travelClass,
      selectOutbound,
      selectReturn,
      setRoundTripStep,
      setIsSearching,
      setReturnResults,
      setSearchError,
    ],
  );

  // ---- 6. Render ----------------------------------------------------------

  // (A) Request form flow
  if (showRequestForm) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <FlightSearchForm compact />
        </div>
        <FlightRequestForm />
      </div>
    );
  }

  // (B) Confirmation flow
  if (roundTripStep === "confirm" && selectedOutbound) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <FlightSearchForm compact />
        </div>
        <FlightConfirmation />
      </div>
    );
  }

  // (C) Full search results layout
  const stepHeader =
    tripType === "round-trip"
      ? roundTripStep === "return"
        ? "Select your return flight"
        : "Select your departure flight"
      : "Select your flight";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          {hasSearch ? "FLIGHT RESULTS" : "SEARCH FLIGHTS"}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {hasSearch
            ? "Comparing fares for your route"
            : "Find the best fares from hundreds of airlines worldwide"}
        </p>
      </div>

      {/* Search form */}
      <div className={hasSearch ? "mb-6" : "mb-12"}>
        <FlightSearchForm compact={hasSearch} />
      </div>

      {/* No search params yet */}
      {!hasSearch && <EmptyPrompt />}

      {/* Error state */}
      {hasSearch && searchError && <ErrorState />}

      {/* Results */}
      {hasSearch && !searchError && (
        <>
          {/* Price calendar (desktop) + strip (mobile) */}
          <div className="mb-6 hidden md:block">
            <PriceCalendar
              origin={origin}
              destination={destination}
              selectedDate={departureDate}
              onDateSelect={handleDateSelect}
            />
          </div>
          <div className="mb-6 md:hidden">
            <PriceDateStrip
              selectedDate={departureDate}
              onDateSelect={handleDateSelect}
            />
          </div>

          {/* Insights */}
          <div className="mb-6 space-y-3">
            <SavingsTip />
            <PriceInsightBar />
            <DirectFlightsBanner />
          </div>

          {/* Step header */}
          <h2 className="mb-4 text-lg font-semibold text-[#1A1A1A]">
            {stepHeader}
          </h2>

          {/* Round trip bar (return step) */}
          {roundTripStep === "return" && <RoundTripBar />}

          {/* Loading return flights */}
          {isSearching && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Searching return flights...</span>
            </div>
          )}

          {/* Two-column layout: filters + results */}
          {!isSearching && (
            <div className="flex gap-6">
              {/* Filter sidebar (desktop) */}
              <aside className="hidden w-60 shrink-0 lg:block">
                <div className="sticky top-20">
                  <FlightFilters results={activeResults} />
                </div>
              </aside>

              {/* Main results area */}
              <div className="min-w-0 flex-1">
                {/* Sort pills + mobile filter sheet */}
                <div className="mb-4 flex items-center gap-3">
                  <FlightSortPills />
                  <div className="lg:hidden">
                    <FlightFilterSheet
                      results={activeResults}
                      filteredCount={filteredResults.length}
                    />
                  </div>
                </div>

                {/* Result count */}
                <p className="mb-3 text-sm text-muted-foreground">
                  {filteredResults.length}{" "}
                  {filteredResults.length === 1 ? "flight" : "flights"} found
                </p>

                {/* Live pricing notice */}
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Prices and seat availability may change. Our advisors can
                    lock in the best fare for you.
                  </p>
                </div>

                {/* Flight cards */}
                {filteredResults.length > 0 ? (
                  <div className="space-y-4">
                    {filteredResults.map((offer, index) => (
                      <div key={offer.id}>
                        <FlightCard
                          offer={offer}
                          onSelect={handleFlightSelect}
                        />

                        {/* Upsell card after the 3rd result */}
                        {index === 2 &&
                          upsellOffers.length > 0 &&
                          upsellOffers[0] && (
                            <div className="mt-4">
                              <FlightCard
                                offer={upsellOffers[0]}
                                onSelect={handleFlightSelect}
                                isUpsell
                              />
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/30 px-6 py-12 text-center">
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      No flights match your filters
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try adjusting your filter criteria to see more results.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
