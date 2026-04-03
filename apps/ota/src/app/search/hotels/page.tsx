import type { Metadata } from "next";
import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { serviceFetch } from "@/lib/api";
import { HotelSearchForm } from "@/components/search/hotel-search-form";
import { HotelProductCard, type HotelProductCardProps } from "@/components/cards/hotel-product-card";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import { SearchPageShell } from "@/components/search/search-page-shell";
import HotelsLoading from "./loading";

export const metadata: Metadata = {
  title: "Search Hotels | Phoenix Voyages",
  description:
    "Find the perfect hotel for your trip. Compare rooms, rates, and board options from thousands of properties worldwide. Book with Phoenix Voyages.",
  openGraph: {
    title: "Search Hotels | Phoenix Voyages",
    description:
      "Find the perfect hotel for your trip. Thousands of properties, expert travel advice.",
  },
};

// ============================================================================
// TYPES
// ============================================================================

// Matches NormalizedHotelResult from packages/shared-types/src/api/hotels.types.ts
interface HotelPriceOffer {
  checkIn: string;
  checkOut: string;
  roomType?: string;
  price: {
    currency: string;
    total: string;
    base?: string;
    taxes?: string;
  };
  cancellationPolicy?: {
    deadline?: string;
    refundable?: boolean;
    description?: string;
  };
  boardType?: string;
}

interface HotelOffer {
  id: string;
  placeId?: string;
  hotelId?: string;
  name: string;
  description?: string;
  location: {
    address: string;
    city?: string;
    country?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  };
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  photos?: { url: string; thumbnailUrl?: string }[];
  amenities?: string[];
  offers?: HotelPriceOffer[];
  provider: string;
}

interface HotelSearchResponse {
  results: HotelOffer[];
  warning?: string;
}

const BOARD_BASIS_LABELS: Record<string, string> = {
  ROOM_ONLY: "Room Only",
  BREAKFAST: "Breakfast Included",
  HALF_BOARD: "Half Board",
  FULL_BOARD: "Full Board",
  ALL_INCLUSIVE: "All Inclusive",
};

function hotelOfferToCardProps(hotel: HotelOffer): HotelProductCardProps {
  const bestOffer = hotel.offers?.[0];
  const locationParts = [hotel.location.city, hotel.location.country].filter(Boolean);
  const priceCents = bestOffer
    ? Math.round(parseFloat(bestOffer.price.total) * 100) || null
    : null;
  const boardType = bestOffer?.boardType
    ? (BOARD_BASIS_LABELS[bestOffer.boardType] ?? bestOffer.boardType)
    : undefined;

  return {
    id: hotel.id,
    name: hotel.name,
    imageUrl: hotel.photos?.[0]?.url ?? null,
    starRating: hotel.starRating,
    userRating: hotel.rating,
    reviewCount: hotel.reviewCount,
    amenities: hotel.amenities,
    location: locationParts.join(", ") || undefined,
    boardType,
    priceCents,
    checkInDate: bestOffer?.checkIn,
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

interface SearchParams {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: string;
  rooms?: string;
}

function hasSearchFilters(params: SearchParams): boolean {
  return !!(params.destination && params.checkIn && params.checkOut);
}

function buildSearchQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.destination) qs.set("destination", params.destination);
  if (params.checkIn) qs.set("checkIn", params.checkIn);
  if (params.checkOut) qs.set("checkOut", params.checkOut);
  if (params.adults) qs.set("adults", params.adults);
  if (params.rooms) qs.set("rooms", params.rooms);
  return qs.toString();
}

async function fetchHotels(params: SearchParams): Promise<HotelSearchResponse | null> {
  try {
    const query = buildSearchQuery(params);
    return await serviceFetch<HotelSearchResponse>(`/ota/search/hotels?${query}`);
  } catch (error) {
    console.error("Failed to fetch hotels:", error);
    return null;
  }
}

// ============================================================================
// PAGE
// ============================================================================

interface HotelsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function HotelsPage({ searchParams }: HotelsPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  const hotels = hasFilters ? await fetchHotels(params) : null;
  const fetchFailed = hasFilters && hotels === null;

  return (
    <SearchPageShell productType="hotels">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
            {hasFilters ? "HOTEL RESULTS" : "SEARCH HOTELS"}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            {hasFilters
              ? "Browsing available properties for your stay"
              : "Find the perfect hotel from thousands of properties worldwide"}
          </p>
        </div>

        {/* Search form */}
        <div className={hasFilters ? "mb-6" : "mb-12"}>
          <HotelSearchForm compact={hasFilters} />
        </div>

        {/* Results section */}
        {fetchFailed ? (
          <ErrorState />
        ) : hotels ? (
          <Suspense fallback={<HotelsLoading />}>
            <HotelResults hotels={hotels} />
          </Suspense>
        ) : (
          <EmptyPrompt />
        )}
      </div>
    </SearchPageShell>
  );
}

// ============================================================================
// RESULTS SUB-COMPONENT
// ============================================================================

function HotelResults({ hotels }: { hotels: HotelSearchResponse }) {
  const { results } = hotels;

  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
        <p className="text-lg font-medium text-[#1A1A1A]">No hotels found for this destination</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your dates, destination code, or guest count.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Results count */}
      <div className="mb-4">
        <SearchResultsHeader count={results.length} noun="hotels" />
      </div>

      {/* Result cards */}
      <div className="space-y-4">
        {results.map((hotel) => (
          <HotelProductCard key={hotel.id} {...hotelOfferToCardProps(hotel)} />
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
      <p className="text-lg font-medium text-[#1A1A1A]">Enter your destination above to find hotels</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Use the IATA city code (e.g. CUN for Cancun, PAR for Paris) along with check-in and check-out dates.
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
      <p className="text-lg font-medium text-[#1A1A1A]">Unable to fetch hotels right now</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The hotel search service may be temporarily unavailable. Please try again.
      </p>
      <a
        href="/search/hotels"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-100"
      >
        <RefreshCw className="size-4" />
        Try Again
      </a>
    </div>
  );
}
