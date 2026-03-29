"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, type FormEvent } from "react";
import { Search, ArrowRightLeft } from "lucide-react";

import { AirportAutocomplete } from "@/components/search/airport-autocomplete";
import { useFlightSearch, type TripType } from "./flight-search-store";
import { cn } from "@/lib/utils";

interface FlightSearchFormProps {
  compact?: boolean;
}

const TRAVEL_CLASS_OPTIONS = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium Economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First Class" },
];

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: "round-trip", label: "Round trip" },
  { value: "one-way", label: "One way" },
];

export function FlightSearchForm({ compact = false }: FlightSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tripType, setTripType, setSearchParams: setStoreParams } =
    useFlightSearch();

  // Read defaults from URL
  const currentOrigin = searchParams.get("origin") ?? "";
  const currentDestination = searchParams.get("destination") ?? "";
  const currentDepartureDate = searchParams.get("departureDate") ?? "";
  const currentReturnDate = searchParams.get("returnDate") ?? "";
  const currentAdults = searchParams.get("adults") ?? "1";
  const currentChildren = searchParams.get("children") ?? "0";
  const currentTravelClass = searchParams.get("travelClass") ?? "ECONOMY";

  // Sync tripType from URL on first load
  const urlTripType = searchParams.get("tripType");
  if (urlTripType === "one-way" && tripType !== "one-way") {
    setTripType("one-way");
  } else if (urlTripType === "round-trip" && tripType !== "round-trip") {
    setTripType("round-trip");
  }

  const isRoundTrip = tripType === "round-trip";

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);

  const handleSwap = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const origin = params.get("origin") ?? "";
    const destination = params.get("destination") ?? "";
    params.set("origin", destination);
    params.set("destination", origin);
    router.replace(`/search/flights?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const params = new URLSearchParams();

      const origin = (form.get("origin") as string)?.trim().toUpperCase();
      const destination = (form.get("destination") as string)
        ?.trim()
        .toUpperCase();

      // IATA validation — hidden input is empty when invalid
      if (!origin || !/^[A-Z]{3}$/.test(origin)) return;
      if (!destination || !/^[A-Z]{3}$/.test(destination)) return;

      params.set("origin", origin);
      params.set("destination", destination);
      params.set("tripType", tripType);

      const departureDate = form.get("departureDate") as string;
      if (departureDate) params.set("departureDate", departureDate);

      const returnDate = form.get("returnDate") as string;
      if (isRoundTrip && returnDate) params.set("returnDate", returnDate);

      const adults = form.get("adults") as string;
      if (adults) params.set("adults", adults);

      const children = form.get("children") as string;
      if (children && children !== "0") params.set("children", children);

      const travelClass = form.get("travelClass") as string;
      if (travelClass) params.set("travelClass", travelClass);

      // Update Zustand store
      setStoreParams?.({
        origin,
        destination,
        departureDate,
        returnDate: isRoundTrip ? returnDate : "",
        adults: parseInt(adults || "1", 10),
        children: parseInt(children || "0", 10),
        travelClass,
      });

      router.push(`/search/flights?${params.toString()}`);
    },
    [router, tripType, isRoundTrip, setStoreParams],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-2xl border border-border bg-white shadow-sm",
        compact ? "p-3" : "p-5",
      )}
    >
      {/* Row 1 — Controls bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Trip type pills */}
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {TRIP_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTripType(t.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tripType === t.value
                  ? "bg-[#1A1A1A] text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Travelers */}
        <div className="inline-flex items-center rounded-lg border border-border">
          <select
            name="adults"
            defaultValue={currentAdults}
            className="h-8 rounded-l-lg border-none bg-transparent px-2 text-sm outline-none focus-visible:ring-0"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Adult" : "Adults"}
              </option>
            ))}
          </select>
          <span className="border-l border-border" />
          <select
            name="children"
            defaultValue={currentChildren}
            className="h-8 rounded-r-lg border-none bg-transparent px-2 text-sm outline-none focus-visible:ring-0"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0
                  ? "No children"
                  : `${n} ${n === 1 ? "Child" : "Children"}`}
              </option>
            ))}
          </select>
        </div>

        {/* Class */}
        <select
          name="travelClass"
          defaultValue={currentTravelClass}
          className="h-8 rounded-lg border border-border bg-transparent px-2 text-sm outline-none focus-visible:ring-0"
        >
          {TRAVEL_CLASS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2 — Search fields */}
      <div
        className={cn(
          "grid items-end gap-2",
          isRoundTrip
            ? "grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_1fr_auto]"
            : "grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_auto]",
        )}
      >
        {/* From */}
        <AirportAutocomplete
          id="fs-origin"
          name="origin"
          label="From"
          placeholder="City or airport..."
          defaultValue={currentOrigin}
          required
        />

        {/* Swap */}
        <button
          type="button"
          onClick={handleSwap}
          title="Swap origin and destination"
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted sm:flex"
        >
          <ArrowRightLeft className="size-4" />
        </button>

        {/* To */}
        <AirportAutocomplete
          id="fs-destination"
          name="destination"
          label="To"
          placeholder="City or airport..."
          defaultValue={currentDestination}
          required
        />

        {/* Depart */}
        <div>
          <label
            htmlFor="fs-departure-date"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Depart
          </label>
          <input
            id="fs-departure-date"
            name="departureDate"
            type="date"
            defaultValue={currentDepartureDate}
            min={today}
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Return — only for round trip */}
        {isRoundTrip && (
          <div>
            <label
              htmlFor="fs-return-date"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Return
            </label>
            <input
              id="fs-return-date"
              name="returnDate"
              type="date"
              defaultValue={currentReturnDate}
              min={currentDepartureDate || today}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        )}

        {/* Search button */}
        <button
          type="submit"
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C59746] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] focus-visible:ring-3 focus-visible:ring-[#C59746]/50"
        >
          <Search className="size-4" />
          <span className="sm:hidden">Search</span>
        </button>
      </div>
    </form>
  );
}
