"use client";

import { useEffect, type ReactNode } from "react";

import { useTripBasket } from "./trip-basket-store";

export function TripBasketProvider({ children }: { children: ReactNode }) {
  const hydrate = useTripBasket((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
