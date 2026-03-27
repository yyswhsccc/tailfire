"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type FormEvent } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { AirportAutocomplete } from "./airport-autocomplete";

interface FlightSearchFormProps {
  compact?: boolean;
  className?: string;
}

const TRAVEL_CLASS_OPTIONS = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium Economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First Class" },
];

export function FlightSearchForm({ compact = false, className }: FlightSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentOrigin = searchParams.get("origin") ?? "";
  const currentDestination = searchParams.get("destination") ?? "";
  const currentDepartureDate = searchParams.get("departureDate") ?? "";
  const currentReturnDate = searchParams.get("returnDate") ?? "";
  const currentAdults = searchParams.get("adults") ?? "1";
  const currentChildren = searchParams.get("children") ?? "0";
  const currentTravelClass = searchParams.get("travelClass") ?? "ECONOMY";

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const params = new URLSearchParams();

      const origin = (form.get("origin") as string)?.trim().toUpperCase();
      if (origin) params.set("origin", origin);

      const destination = (form.get("destination") as string)?.trim().toUpperCase();
      if (destination) params.set("destination", destination);

      const departureDate = form.get("departureDate") as string;
      if (departureDate) params.set("departureDate", departureDate);

      const returnDate = form.get("returnDate") as string;
      if (returnDate) params.set("returnDate", returnDate);

      const adults = form.get("adults") as string;
      if (adults) params.set("adults", adults);

      const children = form.get("children") as string;
      if (children && children !== "0") params.set("children", children);

      const travelClass = form.get("travelClass") as string;
      if (travelClass) params.set("travelClass", travelClass);

      const qs = params.toString();
      router.push(`/search/flights${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-6",
        compact && "p-3 sm:p-4",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-3",
          compact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {/* Origin */}
        <AirportAutocomplete
          id="flight-origin"
          name="origin"
          label="From (city or airport)"
          placeholder="Type a city or airport..."
          defaultValue={currentOrigin}
          required
        />

        {/* Destination */}
        <AirportAutocomplete
          id="flight-destination"
          name="destination"
          label="To (city or airport)"
          placeholder="Type a city or airport..."
          defaultValue={currentDestination}
          required
        />

        {/* Departure Date */}
        <div>
          <label
            htmlFor="flight-departure-date"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Departure Date
          </label>
          <input
            id="flight-departure-date"
            name="departureDate"
            type="date"
            defaultValue={currentDepartureDate}
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Return Date */}
        <div>
          <label
            htmlFor="flight-return-date"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Return Date
          </label>
          <input
            id="flight-return-date"
            name="returnDate"
            type="date"
            defaultValue={currentReturnDate}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Adults */}
        <div>
          <label
            htmlFor="flight-adults"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Adults
          </label>
          <select
            id="flight-adults"
            name="adults"
            defaultValue={currentAdults}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Adult" : "Adults"}
              </option>
            ))}
          </select>
        </div>

        {/* Children */}
        <div>
          <label
            htmlFor="flight-children"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Children
          </label>
          <select
            id="flight-children"
            name="children"
            defaultValue={currentChildren}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "No children" : `${n} ${n === 1 ? "Child" : "Children"}`}
              </option>
            ))}
          </select>
        </div>

        {/* Travel Class */}
        <div>
          <label
            htmlFor="flight-class"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Travel Class
          </label>
          <select
            id="flight-class"
            name="travelClass"
            defaultValue={currentTravelClass}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {TRAVEL_CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit */}
      <div className={cn("mt-4", compact && "mt-3")}>
        <button
          type="submit"
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] focus-visible:ring-3 focus-visible:ring-[#C59746]/50",
          )}
        >
          <Search className="size-4" />
          Search Flights
        </button>
      </div>
    </form>
  );
}
