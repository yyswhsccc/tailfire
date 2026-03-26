"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type FormEvent } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface HotelSearchFormProps {
  compact?: boolean;
  className?: string;
}

export function HotelSearchForm({ compact = false, className }: HotelSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentDestination = searchParams.get("destination") ?? "";
  const currentCheckIn = searchParams.get("checkIn") ?? "";
  const currentCheckOut = searchParams.get("checkOut") ?? "";
  const currentAdults = searchParams.get("adults") ?? "2";
  const currentRooms = searchParams.get("rooms") ?? "1";

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const params = new URLSearchParams();

      const destination = (form.get("destination") as string)?.trim().toUpperCase();
      if (destination) params.set("destination", destination);

      const checkIn = form.get("checkIn") as string;
      if (checkIn) params.set("checkIn", checkIn);

      const checkOut = form.get("checkOut") as string;
      if (checkOut) params.set("checkOut", checkOut);

      const adults = form.get("adults") as string;
      if (adults) params.set("adults", adults);

      const rooms = form.get("rooms") as string;
      if (rooms) params.set("rooms", rooms);

      const qs = params.toString();
      router.push(`/search/hotels${qs ? `?${qs}` : ""}`, { scroll: false });
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
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {/* Destination */}
        <div className={cn(!compact && "sm:col-span-2 lg:col-span-1")}>
          <label
            htmlFor="hotel-destination"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Destination (city code)
          </label>
          <input
            id="hotel-destination"
            name="destination"
            type="text"
            defaultValue={currentDestination}
            placeholder="CUN, PAR, NYC..."
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Check-in */}
        <div>
          <label
            htmlFor="hotel-check-in"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Check-in Date
          </label>
          <input
            id="hotel-check-in"
            name="checkIn"
            type="date"
            defaultValue={currentCheckIn}
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Check-out */}
        <div>
          <label
            htmlFor="hotel-check-out"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Check-out Date
          </label>
          <input
            id="hotel-check-out"
            name="checkOut"
            type="date"
            defaultValue={currentCheckOut}
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Adults */}
        <div>
          <label
            htmlFor="hotel-adults"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Guests (adults)
          </label>
          <select
            id="hotel-adults"
            name="adults"
            defaultValue={currentAdults}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Adult" : "Adults"}
              </option>
            ))}
          </select>
        </div>

        {/* Rooms */}
        <div>
          <label
            htmlFor="hotel-rooms"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Rooms
          </label>
          <select
            id="hotel-rooms"
            name="rooms"
            defaultValue={currentRooms}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Room" : "Rooms"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit */}
      <div className={cn("mt-4", compact && "mt-3")}>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] focus-visible:ring-3 focus-visible:ring-[#C59746]/50"
        >
          <Search className="size-4" />
          Search Hotels
        </button>
      </div>
    </form>
  );
}
