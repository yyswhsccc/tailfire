"use client";

import { MapPin } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { AddToTripButton } from "@/components/trip-builder/add-to-trip-button";
import type { TripComponent } from "@/components/trip-builder/trip-basket-store";

// Matches NormalizedHotelResult from packages/shared-types/src/api/hotels.types.ts
export interface HotelOffer {
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
  rating?: number;       // Google rating 1-5
  reviewCount?: number;
  starRating?: number;   // Hotel star rating 1-5
  photos?: { url: string; thumbnailUrl?: string }[];
  amenities?: string[];
  offers?: HotelPriceOffer[];
  provider: string;
}

export interface HotelPriceOffer {
  checkIn: string;
  checkOut: string;
  roomType?: string;
  price: {
    currency: string;
    total: string;     // dollar amount as string e.g. "234.56"
    base?: string;
    taxes?: string;
  };
  cancellationPolicy?: {
    deadline?: string;
    refundable?: boolean;
    description?: string;
  };
  boardType?: string;  // e.g. "ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "ALL_INCLUSIVE"
}

interface HotelResultCardProps {
  hotel: HotelOffer;
}

/**
 * Simple palette for hotel header gradients — keyed on first char of hotel name.
 */
const HOTEL_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  a: { from: "from-blue-900", to: "to-blue-800", accent: "text-blue-300" },
  b: { from: "from-slate-900", to: "to-slate-800", accent: "text-slate-300" },
  c: { from: "from-indigo-900", to: "to-indigo-800", accent: "text-indigo-300" },
  d: { from: "from-gray-900", to: "to-gray-800", accent: "text-gray-300" },
  e: { from: "from-emerald-900", to: "to-emerald-800", accent: "text-emerald-300" },
  f: { from: "from-violet-900", to: "to-violet-800", accent: "text-violet-300" },
  g: { from: "from-teal-900", to: "to-teal-800", accent: "text-teal-300" },
  h: { from: "from-cyan-900", to: "to-cyan-800", accent: "text-cyan-300" },
  i: { from: "from-sky-900", to: "to-sky-800", accent: "text-sky-300" },
  m: { from: "from-amber-900", to: "to-amber-800", accent: "text-amber-300" },
  n: { from: "from-rose-900", to: "to-rose-800", accent: "text-rose-300" },
  r: { from: "from-red-900", to: "to-red-800", accent: "text-red-300" },
  s: { from: "from-purple-900", to: "to-purple-800", accent: "text-purple-300" },
  w: { from: "from-fuchsia-900", to: "to-fuchsia-800", accent: "text-fuchsia-300" },
};

const DEFAULT_COLORS = { from: "from-[#1A1A1A]", to: "to-[#2A2A2A]", accent: "text-[#C59746]" };

function getHotelColors(name: string) {
  const key = name.charAt(0).toLowerCase();
  return HOTEL_COLORS[key] ?? DEFAULT_COLORS;
}

function renderStars(rating: string | undefined): string {
  const count = parseInt(rating ?? "0", 10);
  return "★".repeat(Math.min(count, 5));
}

function formatBoardBasis(boardType: string | undefined): string {
  if (!boardType) return "";
  const map: Record<string, string> = {
    ROOM_ONLY: "Room Only",
    BREAKFAST: "Breakfast Included",
    HALF_BOARD: "Half Board",
    FULL_BOARD: "Full Board",
    ALL_INCLUSIVE: "All Inclusive",
  };
  return map[boardType] ?? boardType;
}

function getPricePerNight(offer: HotelPriceOffer): number | null {
  const val = parseFloat(offer.price.total);
  if (isNaN(val)) return null;
  // Amadeus prices are in the currency unit (e.g. dollars), multiply to cents
  return Math.round(val * 100);
}

export function HotelResultCard({ hotel }: HotelResultCardProps) {
  const colors = getHotelColors(hotel.name);
  const bestOffer = hotel.offers?.[0];

  const locationParts = [
    hotel.location.city,
    hotel.location.country,
  ].filter(Boolean);
  const locationLabel = locationParts.join(", ");

  const starRatingStr = hotel.starRating ? String(hotel.starRating) : undefined;
  const pricePerNight = bestOffer ? getPricePerNight(bestOffer) : null;

  // Build TripComponent for basket
  const tripComponent: TripComponent = {
    id: `hotel-${hotel.id}`,
    type: "hotel",
    data: {
      hotelId: hotel.id,
      propertyName: hotel.name,
      address: hotel.location.address,
      city: hotel.location.city,
      country: hotel.location.country,
      rating: hotel.rating,
      starRating: hotel.starRating,
      checkIn: bestOffer?.checkIn,
      checkOut: bestOffer?.checkOut,
      roomType: bestOffer?.roomType,
      boardType: bestOffer?.boardType,
      price: bestOffer ? { total: parseFloat(bestOffer.price.total), currency: bestOffer.price.currency } : undefined,
      provider: hotel.provider,
    },
    display: {
      heroImage: hotel.photos?.[0]?.url,
      title: hotel.name,
      subtitle: locationLabel || undefined,
      price: pricePerNight != null ? formatPrice(pricePerNight, bestOffer?.price.currency) + "/night" : undefined,
    },
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Dark gradient header */}
      <div className={`bg-gradient-to-r ${colors.from} ${colors.to} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Star rating */}
            {starRatingStr && (
              <p className="text-[10px] font-bold tracking-wider text-yellow-400">
                {renderStars(starRatingStr)}
              </p>
            )}
            {/* Hotel name */}
            <h3 className="mt-1 truncate text-base font-bold leading-tight text-white sm:text-lg">
              {hotel.name}
            </h3>
            {/* Location */}
            {locationLabel && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-white/60" />
                <p className={`truncate text-xs ${colors.accent}`}>{locationLabel}</p>
              </div>
            )}
          </div>

          {/* Price */}
          {pricePerNight != null ? (
            <div className="shrink-0 text-right">
              <p className="text-xl font-bold text-white sm:text-2xl">
                {formatPrice(pricePerNight, bestOffer?.price.currency)}
              </p>
              <p className="text-[10px] text-white/60">/night</p>
            </div>
          ) : (
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium text-white/70">Contact for pricing</p>
            </div>
          )}
        </div>
      </div>

      {/* White body */}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {/* Board basis */}
          {bestOffer?.boardType && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {formatBoardBasis(bestOffer.boardType)}
            </span>
          )}
          {/* Room type */}
          {bestOffer?.roomType && (
            <span className="text-xs text-muted-foreground">
              {bestOffer.roomType}
            </span>
          )}
          {/* Google rating */}
          {hotel.rating != null && (
            <span className="text-xs text-muted-foreground">
              {hotel.rating}/5 ({hotel.reviewCount ?? 0} reviews)
            </span>
          )}
        </div>

        {/* CTA */}
        <div className="mt-4 flex items-end justify-end gap-2">
          <AddToTripButton component={tripComponent} size="sm" />
          <a
            href="/contact"
            className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Inquire
          </a>
        </div>
      </div>
    </div>
  );
}
