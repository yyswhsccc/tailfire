"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { useTripBasket } from "./trip-basket-store";

export function TripBasketIndicator() {
  const components = useTripBasket((s) => s.components);
  const requestId = useTripBasket((s) => s.requestId);

  const count = components.length;
  if (count === 0 || !requestId) return null;

  return (
    <Link
      href={`/my-trip/${requestId}`}
      className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
    >
      <ShoppingBag className="h-4 w-4" />
      <span>My Trip</span>
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C59746] px-1 text-[10px] font-bold text-white">
        {count}
      </span>
    </Link>
  );
}
