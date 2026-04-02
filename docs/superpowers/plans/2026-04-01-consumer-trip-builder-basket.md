# Consumer Trip Builder — Trip Basket + Add to Trip (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-side trip basket that persists across OTA pages, allowing consumers to add flights, hotels, cruises, and tours to a draft trip request via "Add to Trip" buttons on search result cards.

**Architecture:** Zustand store (`useTripBasket`) syncs to the backend via Next.js proxy routes. Hydrates on mount from `ota_session` cookie. "Add to Trip" button component is reusable across all search pages. Multi-draft picker shown when consumer has multiple draft trips.

**Tech Stack:** React 19, Zustand, Next.js 15 App Router, existing search result card components

**Spec:** `docs/superpowers/specs/2026-04-01-consumer-trip-builder-design.md`
**Depends on:** Plan A (Backend Foundation) — already implemented

---

## File Structure

```
apps/ota/src/
├── components/trip-builder/
│   ├── trip-basket-store.ts            # NEW — Zustand store
│   ├── trip-basket-provider.tsx        # NEW — Context provider, hydrates from cookie
│   ├── add-to-trip-button.tsx          # NEW — Reusable button for search cards
│   ├── trip-picker-dropdown.tsx        # NEW — Multi-draft picker
│   └── trip-basket-indicator.tsx       # NEW — Nav badge showing component count
├── components/flights/
│   └── flight-card.tsx                 # MODIFY — add "Add to Trip" button
├── components/layout/
│   └── nav.tsx                         # MODIFY — add trip basket indicator
├── app/layout.tsx                      # MODIFY — wrap with TripBasketProvider
```

---

### Task 1: Zustand Store — `useTripBasket`

**Files:**
- Create: `apps/ota/src/components/trip-builder/trip-basket-store.ts`

The central state store for the trip basket. Syncs to backend via client-safe fetch calls to the proxy routes.

- [ ] **Step 1: Create the store**

```typescript
// apps/ota/src/components/trip-builder/trip-basket-store.ts
"use client";

import { create } from "zustand";

export interface TripComponent {
  id: string;
  type: "flight" | "hotel" | "cruise" | "tour" | "package" | "custom";
  data: Record<string, any>;
  display?: {
    heroImage?: string;
    title?: string;
    subtitle?: string;
    price?: string;
    badges?: string[];
    notes?: string;
  };
}

export interface InspirationCard {
  id: string;
  destination: string;
  imageUrl: string;
  caption: string;
  source: string;
  sourceId?: string;
  attribution?: string;
}

interface TripBasketState {
  // State
  requestId: string | null;
  title: string | null;
  components: TripComponent[];
  inspiration: InspirationCard[];
  boardOrder: Array<{ type: "component" | "inspiration"; id: string }>;
  isLoading: boolean;
  isIdentified: boolean;
  sessionId: string | null;

  // Drafts (for multi-draft picker)
  drafts: Array<{ id: string; title: string | null; componentCount: number }>;

  // Actions
  hydrate: () => Promise<void>;
  createDraft: (firstComponent: TripComponent, sessionId: string) => Promise<string>;
  addComponent: (component: TripComponent) => Promise<void>;
  removeComponent: (componentId: string) => Promise<void>;
  updateBoardOrder: (order: Array<{ type: string; id: string }>) => Promise<void>;
  setActiveRequest: (requestId: string) => void;
  linkIdentity: (email: string, name?: string, phone?: string) => Promise<{ contactId: string; isExisting: boolean }>;
  reset: () => void;
}

async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const useTripBasket = create<TripBasketState>((set, get) => ({
  requestId: null,
  title: null,
  components: [],
  inspiration: [],
  boardOrder: [],
  isLoading: false,
  isIdentified: false,
  sessionId: null,
  drafts: [],

  hydrate: async () => {
    // Read ota_session from cookie
    const cookies = document.cookie.split(";").reduce((acc, c) => {
      const [k, v] = c.trim().split("=");
      if (k && v) acc[k] = v;
      return acc;
    }, {} as Record<string, string>);

    const sessionId = cookies["ota_session"];
    if (!sessionId) return;

    set({ isLoading: true, sessionId });

    try {
      const drafts = await clientFetch<any[]>(`/api/trip-requests/by-session/${sessionId}`);
      if (drafts.length > 0) {
        const active = drafts[0];
        set({
          requestId: active.id,
          title: active.title,
          components: active.components || [],
          inspiration: active.inspiration || [],
          boardOrder: active.boardOrder || [],
          isIdentified: !!active.contactEmail,
          drafts: drafts.map((d: any) => ({
            id: d.id,
            title: d.title,
            componentCount: (d.components || []).length,
          })),
        });
      }
    } catch {
      // Silent — no basket yet
    } finally {
      set({ isLoading: false });
    }
  },

  createDraft: async (firstComponent, sessionId) => {
    set({ isLoading: true });
    try {
      // Auto-generate title from first component
      const title = firstComponent.display?.title
        ? `${firstComponent.display.title} Trip`
        : "My Trip";

      const { requestId } = await clientFetch<{ requestId: string }>("/api/trip-requests", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          title,
          components: [firstComponent],
        }),
      });

      set({
        requestId,
        title,
        components: [firstComponent],
        boardOrder: [{ type: "component", id: firstComponent.id }],
        sessionId,
        drafts: [{ id: requestId, title, componentCount: 1 }],
      });

      return requestId;
    } finally {
      set({ isLoading: false });
    }
  },

  addComponent: async (component) => {
    const { requestId, sessionId, components, boardOrder } = get();

    if (!requestId) {
      // No active draft — create one
      if (sessionId) {
        await get().createDraft(component, sessionId);
      }
      return;
    }

    set({ isLoading: true });
    try {
      await clientFetch(`/api/trip-requests/${requestId}/components/add`, {
        method: "POST",
        body: JSON.stringify({ component }),
      });

      const newComponents = [...components, component];
      const newBoardOrder = [...boardOrder, { type: "component" as const, id: component.id }];
      set({ components: newComponents, boardOrder: newBoardOrder });
    } finally {
      set({ isLoading: false });
    }
  },

  removeComponent: async (componentId) => {
    const { requestId, components, boardOrder } = get();
    if (!requestId) return;

    set({ isLoading: true });
    try {
      await clientFetch(`/api/trip-requests/${requestId}/components/${componentId}`, {
        method: "DELETE",
      });

      set({
        components: components.filter((c) => c.id !== componentId),
        boardOrder: boardOrder.filter(
          (item) => !(item.type === "component" && item.id === componentId),
        ),
      });
    } finally {
      set({ isLoading: false });
    }
  },

  updateBoardOrder: async (order) => {
    const { requestId } = get();
    if (!requestId) return;

    try {
      await clientFetch(`/api/trip-requests/${requestId}/board-order`, {
        method: "PATCH",
        body: JSON.stringify({ boardOrder: order }),
      });
      set({ boardOrder: order });
    } catch {
      // Revert on failure — re-hydrate
      await get().hydrate();
    }
  },

  setActiveRequest: (requestId) => {
    const { drafts } = get();
    const draft = drafts.find((d) => d.id === requestId);
    if (draft) {
      set({ requestId });
      // Re-hydrate to load full data
      get().hydrate();
    }
  },

  linkIdentity: async (email, name?, phone?) => {
    const { requestId } = get();
    if (!requestId) throw new Error("No active trip request");

    const result = await clientFetch<{ contactId: string; isExisting: boolean }>(`/api/trip-requests/${requestId}/identity`, {
      method: "PATCH",
      body: JSON.stringify({ email, name, phone }),
    });

    set({ isIdentified: true });
    return result;
  },

  reset: () =>
    set({
      requestId: null,
      title: null,
      components: [],
      inspiration: [],
      boardOrder: [],
      isLoading: false,
      isIdentified: false,
      drafts: [],
    }),
}));
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/trip-builder/trip-basket-store.ts
git commit -m "feat(ota): trip basket Zustand store with CRUD sync to backend"
```

---

### Task 2: Trip Basket Provider

**Files:**
- Create: `apps/ota/src/components/trip-builder/trip-basket-provider.tsx`
- Modify: `apps/ota/src/app/layout.tsx`

Provider component that hydrates the basket on mount.

- [ ] **Step 1: Create the provider**

```typescript
// apps/ota/src/components/trip-builder/trip-basket-provider.tsx
"use client";

import { useEffect } from "react";
import { useTripBasket } from "./trip-basket-store";

export function TripBasketProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useTripBasket((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap layout with provider**

In `apps/ota/src/app/layout.tsx`, import `TripBasketProvider` and wrap the children:
```tsx
<TripBasketProvider>
  {children}
</TripBasketProvider>
```

Read the file first to find the right place to add it (inside any existing providers but wrapping the main content).

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/trip-builder/trip-basket-provider.tsx apps/ota/src/app/layout.tsx
git commit -m "feat(ota): trip basket provider — hydrates from session cookie on mount"
```

---

### Task 3: "Add to Trip" Button Component

**Files:**
- Create: `apps/ota/src/components/trip-builder/add-to-trip-button.tsx`
- Create: `apps/ota/src/components/trip-builder/trip-picker-dropdown.tsx`

Reusable button that can be placed on any search result card.

- [ ] **Step 1: Create the button component**

```typescript
// apps/ota/src/components/trip-builder/add-to-trip-button.tsx
"use client";

import { useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTripBasket, type TripComponent } from "./trip-basket-store";
import { TripPickerDropdown } from "./trip-picker-dropdown";

interface AddToTripButtonProps {
  component: TripComponent;
  size?: "sm" | "default";
  className?: string;
}

export function AddToTripButton({ component, size = "sm", className }: AddToTripButtonProps) {
  const { components, drafts, addComponent, isLoading } = useTripBasket();
  const [showPicker, setShowPicker] = useState(false);
  const [added, setAdded] = useState(false);

  // Check if already in basket
  const alreadyAdded = components.some((c) => c.id === component.id);

  if (alreadyAdded || added) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        className={className}
      >
        <Check className="mr-1 size-3.5 text-emerald-600" />
        Added
      </Button>
    );
  }

  const handleAdd = async () => {
    if (drafts.length > 1) {
      setShowPicker(true);
      return;
    }

    await addComponent(component);
    setAdded(true);
    setTimeout(() => setAdded(false), 3000); // Reset after 3s
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size={size}
        onClick={handleAdd}
        disabled={isLoading}
        className={className}
      >
        {isLoading ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1 size-3.5" />
        )}
        Add to Trip
      </Button>

      {showPicker && (
        <TripPickerDropdown
          component={component}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the picker dropdown**

```typescript
// apps/ota/src/components/trip-builder/trip-picker-dropdown.tsx
"use client";

import { Plus } from "lucide-react";
import { useTripBasket, type TripComponent } from "./trip-basket-store";

interface TripPickerDropdownProps {
  component: TripComponent;
  onClose: () => void;
}

export function TripPickerDropdown({ component, onClose }: TripPickerDropdownProps) {
  const { drafts, setActiveRequest, addComponent, createDraft, sessionId } = useTripBasket();

  const handleSelect = async (draftId: string) => {
    setActiveRequest(draftId);
    await addComponent(component);
    onClose();
  };

  const handleNewTrip = async () => {
    if (sessionId) {
      await createDraft(component, sessionId);
    }
    onClose();
  };

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-white p-1 shadow-lg">
      {drafts.map((draft) => (
        <button
          key={draft.id}
          onClick={() => handleSelect(draft.id)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
        >
          <span className="flex-1 truncate">{draft.title || "Untitled Trip"}</span>
          <span className="text-xs text-muted-foreground">{draft.componentCount} items</span>
        </button>
      ))}
      <div className="my-1 border-t border-border" />
      <button
        onClick={handleNewTrip}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#C59746] hover:bg-muted"
      >
        <Plus className="size-3.5" />
        New Trip
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/trip-builder/add-to-trip-button.tsx apps/ota/src/components/trip-builder/trip-picker-dropdown.tsx
git commit -m "feat(ota): Add to Trip button + multi-draft picker dropdown"
```

---

### Task 4: Add "Add to Trip" to Flight Cards + Nav Indicator

**Files:**
- Modify: `apps/ota/src/components/flights/flight-card.tsx`
- Create: `apps/ota/src/components/trip-builder/trip-basket-indicator.tsx`
- Modify: `apps/ota/src/components/layout/nav.tsx`

- [ ] **Step 1: Add button to flight card**

In `apps/ota/src/components/flights/flight-card.tsx`, import `AddToTripButton` and `TripComponent`. In the card's Zone 3 (price area), add the button below the price:

```tsx
<AddToTripButton
  component={{
    id: offer.id,
    type: "flight",
    data: {
      segments: offer.segments.map((s) => ({
        airline: s.carrier,
        airlineName: s.carrierName,
        flightNumber: s.flightNumber,
        origin: s.departure.iataCode,
        destination: s.arrival.iataCode,
        departureAt: s.departure.at,
        arrivalAt: s.arrival.at,
        duration: s.duration,
        cabin: s.cabin || offer.cabin,
        aircraft: s.aircraft,
      })),
      price: offer.price,
      fareFamily: offer.fareFamily,
      baggageAllowance: offer.baggageAllowance,
    },
    display: {
      heroImage: undefined, // Will be enriched later
      title: `${offer.segments[0]?.departure.iataCode} → ${offer.segments[offer.segments.length - 1]?.arrival.iataCode}`,
      subtitle: `${offer.validatingAirline} ${offer.segments[0]?.flightNumber}`,
      price: formatPrice(offer.price.perTraveler, offer.price.currency),
    },
  }}
  size="sm"
/>
```

The button should NOT interfere with the card's existing `onSelect` click handler. Place it inside a `<div onClick={(e) => e.stopPropagation()}>` wrapper to prevent the card click from firing.

- [ ] **Step 2: Create nav indicator**

```typescript
// apps/ota/src/components/trip-builder/trip-basket-indicator.tsx
"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useTripBasket } from "./trip-basket-store";

export function TripBasketIndicator() {
  const { requestId, components } = useTripBasket();

  if (!requestId || components.length === 0) return null;

  return (
    <Link
      href={`/my-trip/${requestId}`}
      className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
    >
      <ShoppingBag className="size-4" />
      My Trip
      <span className="flex size-5 items-center justify-center rounded-full bg-[#C59746] text-[10px] font-bold text-white">
        {components.length}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Add indicator to nav**

In `apps/ota/src/components/layout/nav.tsx`, import `TripBasketIndicator` and add it in the desktop nav bar (before the "Talk to AI" CTA button).

- [ ] **Step 4: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/src/components/flights/flight-card.tsx apps/ota/src/components/trip-builder/trip-basket-indicator.tsx apps/ota/src/components/layout/nav.tsx
git commit -m "feat(ota): Add to Trip on flight cards + nav basket indicator"
```

---

## Post-Plan Notes

**What this plan builds:**
- Persistent trip basket across all OTA pages
- "Add to Trip" button on flight cards (pattern for other search pages)
- Multi-draft picker when consumer has multiple trips
- Nav indicator with component count badge
- Auto-creates anonymous draft on first add

**What needs follow-up:**
- Add "Add to Trip" to hotel, cruise, tour, and deal cards (same pattern)
- Plan C: Dream Board page with masonry grid
- Plan D: AI concierge integration
- Plan E: Submit flow
