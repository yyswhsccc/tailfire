"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";
import { DEFAULT_FILTERS } from "@/lib/flight-utils";
import { FlightFilters } from "./flight-filters";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlightFilterSheetProps {
  results: FlightOffer[];
  filteredCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlightFilterSheet({
  results,
  filteredCount,
}: FlightFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const filters = useFlightSearch((s) => s.filters);

  // Count active filter categories (not individual values)
  const activeCount = [
    filters.stops.length > 0,
    filters.airlines.length > 0,
    filters.priceRange[0] !== DEFAULT_FILTERS.priceRange[0] ||
      filters.priceRange[1] !== DEFAULT_FILTERS.priceRange[1],
    filters.timeBuckets.length > 0,
    filters.maxDuration > 0,
  ].filter(Boolean).length;

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" size="sm" className="relative gap-1.5" />
          }
        >
          <SlidersHorizontal className="size-3.5" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-[#C59746] text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </SheetTrigger>

        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-4">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <FlightFilters results={results} />

          <div className="mt-4 pt-3 border-t">
            <Button
              className="w-full bg-[#C59746] text-white hover:bg-[#b08638]"
              onClick={() => setOpen(false)}
            >
              Show {filteredCount} flight{filteredCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
