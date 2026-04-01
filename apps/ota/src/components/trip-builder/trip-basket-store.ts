"use client";

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface TripComponent {
  id: string;
  type: "flight" | "hotel" | "cruise" | "tour" | "package" | "custom";
  data: Record<string, unknown>;
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

export interface BoardOrderItem {
  type: "component" | "inspiration";
  id: string;
}

export interface DraftSummary {
  id: string;
  title: string | null;
  componentCount: number;
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

interface TripBasketState {
  // State
  requestId: string | null;
  title: string | null;
  components: TripComponent[];
  inspiration: InspirationCard[];
  boardOrder: BoardOrderItem[];
  isLoading: boolean;
  isIdentified: boolean;
  sessionId: string | null;

  // Drafts (for multi-draft picker)
  drafts: DraftSummary[];

  // Actions
  hydrate: () => Promise<void>;
  createDraft: (
    firstComponent: TripComponent,
    sessionId: string,
  ) => Promise<string>;
  addComponent: (component: TripComponent) => Promise<void>;
  removeComponent: (componentId: string) => Promise<void>;
  updateBoardOrder: (order: BoardOrderItem[]) => Promise<void>;
  setActiveRequest: (requestId: string) => void;
  linkIdentity: (
    email: string,
    name?: string,
    phone?: string,
  ) => Promise<{ contactId: string; isExisting: boolean }>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Backend response shape (from GET /api/trip-requests/by-session/:sid)
// ---------------------------------------------------------------------------

interface TripRequestDTO {
  id: string;
  title: string | null;
  components?: TripComponent[];
  inspiration?: InspirationCard[];
  boardOrder?: BoardOrderItem[];
  contactEmail?: string | null;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  requestId: null as string | null,
  title: null as string | null,
  components: [] as TripComponent[],
  inspiration: [] as InspirationCard[],
  boardOrder: [] as BoardOrderItem[],
  isLoading: false,
  isIdentified: false,
  sessionId: null as string | null,
  drafts: [] as DraftSummary[],
};

export const useTripBasket = create<TripBasketState>((set, get) => ({
  ...INITIAL_STATE,

  hydrate: async () => {
    // Read ota_session from cookie
    const cookies = document.cookie.split(";").reduce(
      (acc, c) => {
        const [k, v] = c.trim().split("=");
        if (k && v) acc[k] = v;
        return acc;
      },
      {} as Record<string, string>,
    );

    const sessionId = cookies["ota_session"];
    if (!sessionId) return;

    set({ isLoading: true, sessionId });

    try {
      const drafts = await clientFetch<TripRequestDTO[]>(
        `/api/trip-requests/by-session/${sessionId}`,
      );

      const active = drafts[0];
      if (active) {
        set({
          requestId: active.id,
          title: active.title,
          components: active.components ?? [],
          inspiration: active.inspiration ?? [],
          boardOrder: active.boardOrder ?? [],
          isIdentified: !!active.contactEmail,
          drafts: drafts.map((d) => ({
            id: d.id,
            title: d.title,
            componentCount: (d.components ?? []).length,
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

      const { requestId } = await clientFetch<{ requestId: string }>(
        "/api/trip-requests",
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            title,
            components: [firstComponent],
          }),
        },
      );

      set({
        requestId,
        title,
        components: [firstComponent],
        boardOrder: [{ type: "component" as const, id: firstComponent.id }],
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
      const newBoardOrder: BoardOrderItem[] = [
        ...boardOrder,
        { type: "component", id: component.id },
      ];
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
      await clientFetch(
        `/api/trip-requests/${requestId}/components/${componentId}`,
        { method: "DELETE" },
      );

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

    // Optimistic update
    const previousOrder = get().boardOrder;
    set({ boardOrder: order });

    try {
      await clientFetch(`/api/trip-requests/${requestId}/board-order`, {
        method: "PATCH",
        body: JSON.stringify({ boardOrder: order }),
      });
    } catch {
      // Revert on failure
      set({ boardOrder: previousOrder });
    }
  },

  setActiveRequest: (requestId) => {
    const { drafts } = get();
    const draft = drafts.find((d) => d.id === requestId);
    if (draft) {
      set({ requestId });
      // Re-hydrate to load full data for the selected draft
      get().hydrate();
    }
  },

  linkIdentity: async (email, name?, phone?) => {
    const { requestId } = get();
    if (!requestId) throw new Error("No active trip request");

    const result = await clientFetch<{
      contactId: string;
      isExisting: boolean;
    }>(`/api/trip-requests/${requestId}/identity`, {
      method: "PATCH",
      body: JSON.stringify({ email, name, phone }),
    });

    set({ isIdentified: true });
    return result;
  },

  reset: () => set({ ...INITIAL_STATE }),
}));
