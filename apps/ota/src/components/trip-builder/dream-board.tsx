"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Plane, Hotel, Ship, Map } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  useTripBasket,
  type TripComponent,
  type InspirationCard,
  type BoardOrderItem,
} from "./trip-basket-store";
import { getCuratedImage } from "@/lib/curated-images";
import { BoardHeader } from "./board-header";
import { BoardAddMenu } from "./board-add-menu";
import { BoardEmptyState } from "./board-empty-state";
import { BoardFunctionalCard } from "./board-functional-card";
import { BoardInspirationCard } from "./board-inspiration-card";
import { SubmitReview } from "./submit-review";
import { AiBoardPanel } from "./ai-board-panel";
import { AiMobileBar } from "./ai-mobile-bar";

interface DreamBoardProps {
  requestId: string;
  title: string | null;
  components: TripComponent[];
  inspiration: InspirationCard[];
  boardOrder: BoardOrderItem[];
  readOnly: boolean;
  startDate?: string;
  endDate?: string;
  travelers?: number;
}

function computeTotal(components: TripComponent[]): number {
  return components.reduce((sum, c) => {
    const price = (c.data as Record<string, unknown>)?.price as
      | Record<string, unknown>
      | undefined;
    const raw = price?.total;
    const total = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) || 0 : 0;
    return sum + total;
  }, 0);
}

/** Return true if the string looks like a 3-letter IATA code (all uppercase). */
function looksLikeIataCode(s: string): boolean {
  return /^[A-Z]{3}$/.test(s.trim());
}

/**
 * Try to extract a human-readable city name from a display title.
 * Handles patterns like "YOW -> Cancun", "Ottawa -> CUN", etc.
 * Returns the most readable portion, preferring non-IATA text.
 */
function readableCityFromTitle(title: string): string | null {
  // Arrow separator: "Origin -> Destination" — prefer the destination side
  const arrowMatch = title.match(/\u2192|→|->|>>/);
  if (arrowMatch && arrowMatch.index != null) {
    const after = title.slice(arrowMatch.index + arrowMatch[0].length).trim();
    if (after && !looksLikeIataCode(after)) return after;
    // Destination is a code — try the origin side for a readable name
    const before = title.slice(0, arrowMatch.index).trim();
    if (before && !looksLikeIataCode(before)) return before;
    // Both sides are codes — return destination code as fallback
    if (after) return after;
  }
  // No arrow — if title itself is not an IATA code, use it
  if (!looksLikeIataCode(title)) return title;
  return null;
}

/** Extract a destination string from components for inspiration auto-fetch. */
function extractDestination(components: TripComponent[]): string | null {
  for (const c of components) {
    const data = c.data as Record<string, unknown>;

    // First, try to get a readable name from the display title
    if (c.display?.title) {
      const readable = readableCityFromTitle(c.display.title);
      if (readable && !looksLikeIataCode(readable)) return readable;
    }

    // Flight: destination city or airport code
    if (c.type === "flight") {
      const dest =
        (data.destinationCity as string) ||
        (data.arrivalCity as string) ||
        (data.destination as string) ||
        (data.to as string);
      if (dest) return dest;
    }
    // Hotel: property name, city, or location
    if (c.type === "hotel") {
      const loc =
        (data.city as string) ||
        (data.location as string) ||
        (data.destination as string);
      if (loc) return loc;
      // Try address city portion
      const address = data.address as Record<string, unknown> | undefined;
      if (address) {
        const addrCity = (address.city as string) || (address.cityName as string);
        if (addrCity) return addrCity;
      }
    }
    // Cruise: destination port or region
    if (c.type === "cruise") {
      const port =
        (data.departurePort as string) ||
        (data.destination as string) ||
        (data.region as string);
      if (port) return port;
    }
    // Tour: departure city, destination, or name-based location
    if (c.type === "tour") {
      const dest =
        (data.departureCity as string) ||
        (data.destination as string) ||
        (data.location as string);
      if (dest) return dest;
    }
  }
  // Fallback: try display title for any component, preferring readable text
  for (const c of components) {
    if (c.display?.title) {
      const readable = readableCityFromTitle(c.display.title);
      if (readable) return readable;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auto-generated inspiration from curated Unsplash photos
// ---------------------------------------------------------------------------

/** Map component types to curated photo categories. */
const COMPONENT_TYPE_CATEGORY: Record<string, string> = {
  cruise: "cruise",
  hotel: "tropical",
  flight: "default",
  tour: "mountain",
  package: "beach",
  custom: "default",
};

/** A few curated category variants per destination to add visual variety. */
const VARIETY_CATEGORIES = ["beach", "city", "tropical", "island", "mountain", "cruise"];

/** Extract destination name from a single component. */
function extractComponentDestination(c: TripComponent): string | null {
  const data = c.data as Record<string, unknown>;

  // Readable name from display title
  if (c.display?.title) {
    const readable = readableCityFromTitle(c.display.title);
    if (readable && !looksLikeIataCode(readable)) return readable;
  }

  if (c.type === "flight") {
    return (
      (data.destinationCity as string) ||
      (data.arrivalCity as string) ||
      (data.destination as string) ||
      (data.to as string) ||
      null
    );
  }
  if (c.type === "hotel") {
    const loc =
      (data.city as string) ||
      (data.location as string) ||
      (data.destination as string);
    if (loc) return loc;
    const address = data.address as Record<string, unknown> | undefined;
    if (address) {
      return (address.city as string) || (address.cityName as string) || null;
    }
  }
  if (c.type === "cruise") {
    return (
      (data.departurePort as string) ||
      (data.destination as string) ||
      (data.region as string) ||
      null
    );
  }
  if (c.type === "tour") {
    return (
      (data.departureCity as string) ||
      (data.destination as string) ||
      (data.location as string) ||
      null
    );
  }

  // Fallback: display subtitle (often has the location)
  if (c.display?.subtitle) {
    const sub = c.display.subtitle.trim();
    if (sub && !looksLikeIataCode(sub)) return sub;
  }

  return null;
}

/** Extract unique {destination, type} pairs from trip components. */
function extractDestinations(
  components: TripComponent[],
): Array<{ destination: string; type: string }> {
  const seen = new Set<string>();
  const results: Array<{ destination: string; type: string }> = [];

  for (const c of components) {
    const dest = extractComponentDestination(c);
    if (!dest) continue;
    const key = dest.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ destination: dest, type: c.type });
  }

  return results;
}

/**
 * Build curated InspirationCard objects from trip components.
 * Generates 2-4 cards using deterministic Unsplash URLs —
 * no API call needed, renders instantly.
 */
function generateCuratedInspiration(
  components: TripComponent[],
): InspirationCard[] {
  const destinations = extractDestinations(components);
  if (destinations.length === 0) return [];

  const cards: InspirationCard[] = [];
  const TARGET = 4; // max cards to generate

  // First pass: one card per unique destination with its natural category
  for (const { destination, type } of destinations) {
    if (cards.length >= TARGET) break;
    const category = COMPONENT_TYPE_CATEGORY[type] || "default";
    const imageUrl = getCuratedImage(destination, category, "card");
    cards.push({
      id: `curated-${destination.toLowerCase().replace(/\s+/g, "-")}-${category}`,
      destination,
      imageUrl,
      caption: `Dreaming of ${destination}`,
      source: "curated",
    });
  }

  // Second pass: fill remaining slots with variety categories for the first destination
  if (cards.length < TARGET && destinations.length > 0) {
    const primary = destinations[0]!;
    const usedCategories = new Set(
      cards.map((c) => {
        // Extract category from id suffix
        const parts = c.id.split("-");
        return parts[parts.length - 1];
      }),
    );

    for (const cat of VARIETY_CATEGORIES) {
      if (cards.length >= TARGET) break;
      if (usedCategories.has(cat)) continue;
      usedCategories.add(cat);

      const imageUrl = getCuratedImage(primary.destination, cat, "card");
      // Skip if this URL is identical to one we already have
      if (cards.some((c) => c.imageUrl === imageUrl)) continue;

      const captions: Record<string, string> = {
        beach: `${primary.destination} beaches`,
        city: `Explore ${primary.destination}`,
        tropical: `Paradise in ${primary.destination}`,
        island: `Island vibes`,
        mountain: `Adventures await`,
        cruise: `Set sail from ${primary.destination}`,
      };

      cards.push({
        id: `curated-${primary.destination.toLowerCase().replace(/\s+/g, "-")}-${cat}`,
        destination: primary.destination,
        imageUrl,
        caption: captions[cat] || `Discover ${primary.destination}`,
        source: "curated",
      });
    }
  }

  return cards;
}

/** Hero banner at the top of the dream board */
function TripBanner({
  title,
  startDate,
  endDate,
  travelers,
  bannerImage,
  destination,
}: {
  title: string | null;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  bannerImage: string | null;
  destination: string | null;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl h-[200px] sm:h-[240px]">
      {/* Background: image or gradient */}
      {bannerImage ? (
        <img
          src={bannerImage}
          alt={destination || "Trip destination"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A1A1A] via-[#2A2A2A] to-[#C59746]/40" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {title || "My Dream Trip"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/80">
          {destination && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
              {destination}
            </span>
          )}
          {startDate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
              {startDate}
              {endDate ? ` — ${endDate}` : ""}
            </span>
          )}
          {travelers && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
              {travelers} traveler{travelers !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sortable wrapper for each card on the board. */
function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    cursor: "grab",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function DreamBoard(props: DreamBoardProps) {
  const {
    requestId,
    readOnly,
    startDate,
    endDate,
    travelers,
  } = props;

  const removeComponent = useTripBasket((s) => s.removeComponent);
  const updateBoardOrder = useTripBasket((s) => s.updateBoardOrder);
  const isIdentified = useTripBasket((s) => s.isIdentified);
  const [showSubmit, setShowSubmit] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const inspirationFetched = useRef(false);

  // Read from Zustand store (which gets seeded from props on mount)
  const storeComponents = useTripBasket((s) => s.components);
  const storeInspiration = useTripBasket((s) => s.inspiration);
  const storeBoardOrder = useTripBasket((s) => s.boardOrder);
  const storeTitle = useTripBasket((s) => s.title);

  // Seed Zustand store from server-fetched data so client mutations
  // (removeComponent, updateBoardOrder) have the requestId they need.
  useEffect(() => {
    useTripBasket.setState({
      requestId,
      title: props.title,
      components: props.components,
      inspiration: props.inspiration,
      boardOrder: props.boardOrder,
    });
  }, [requestId]); // Only on mount / request change

  // Use store values for rendering, falling back to props on first render
  const components =
    storeComponents.length > 0 ? storeComponents : props.components;
  const inspiration =
    storeInspiration.length > 0 ? storeInspiration : props.inspiration;
  const boardOrder =
    storeBoardOrder.length > 0 ? storeBoardOrder : props.boardOrder;
  const title = storeTitle ?? props.title;

  // Auto-generate curated inspiration cards from trip destinations.
  // Deterministic (no API call) — runs on the client from curated Unsplash URLs.
  const destination = extractDestination(components);

  const curatedCards = useMemo(
    () => generateCuratedInspiration(components),
    // Re-derive when component count or first destination changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [components.length, destination],
  );

  useEffect(() => {
    if (inspirationFetched.current) return;
    if (components.length === 0 || inspiration.length > 0) return;
    if (curatedCards.length === 0) return;

    inspirationFetched.current = true;

    useTripBasket.setState((state) => ({
      inspiration: curatedCards,
      boardOrder: [
        ...state.boardOrder,
        ...curatedCards.map((c) => ({
          type: "inspiration" as const,
          id: c.id,
        })),
      ],
    }));
  }, [components.length, inspiration.length, curatedCards]);

  // Banner image: use first inspiration image if available
  const firstInspiration = inspiration[0];
  const bannerImage = firstInspiration ? firstInspiration.imageUrl : null;

  const handleRemove = useCallback(
    (id: string) => {
      removeComponent(id);
    },
    [removeComponent],
  );

  const totalEstimate = computeTotal(components);
  const hasComponents = components.length > 0;

  // Build the ordered list of items to render
  const orderedItems: Array<
    | { kind: "component"; item: TripComponent }
    | { kind: "inspiration"; item: InspirationCard }
  > = [];

  if (boardOrder.length > 0) {
    for (const entry of boardOrder) {
      if (entry.type === "component") {
        const found = components.find((c) => c.id === entry.id);
        if (found) orderedItems.push({ kind: "component", item: found });
      } else {
        const found = inspiration.find((c) => c.id === entry.id);
        if (found) orderedItems.push({ kind: "inspiration", item: found });
      }
    }
  } else {
    // No explicit order: components first, then inspiration
    for (const c of components) {
      orderedItems.push({ kind: "component", item: c });
    }
    for (const c of inspiration) {
      orderedItems.push({ kind: "inspiration", item: c });
    }
  }

  // DnD sensors — pointer needs a small activation distance to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stable list of sortable IDs (must match the order of rendered items)
  const sortableIds = orderedItems.map((e) => e.item.id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sortableIds.indexOf(active.id as string);
      const newIndex = sortableIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      // Build the new board order from orderedItems in their new positions
      const reordered = arrayMove(orderedItems, oldIndex, newIndex);
      const newBoardOrder: BoardOrderItem[] = reordered.map((entry) => ({
        id: entry.item.id,
        type: entry.kind === "component" ? ("component" as const) : ("inspiration" as const),
      }));

      updateBoardOrder(newBoardOrder);
    },
    [orderedItems, sortableIds, updateBoardOrder],
  );

  // Submit review flow
  if (showSubmit) {
    return (
      <SubmitReview
        requestId={requestId}
        components={components}
        startDate={startDate}
        travelers={travelers}
        isIdentified={isIdentified}
        onBack={() => setShowSubmit(false)}
      />
    );
  }

  // Render the card grid — wrapped in DnD when not readOnly
  const cardGrid = (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-auto">
      <AnimatePresence mode="popLayout">
        {orderedItems.map((entry, index) => {
          // First component card spans 2 columns on desktop for hero effect
          const isHero = index === 0 && entry.kind === "component";

          const card =
            entry.kind === "component" ? (
              <BoardFunctionalCard
                component={entry.item}
                readOnly={readOnly}
                onRemove={handleRemove}
                isHero={isHero}
              />
            ) : (
              <BoardInspirationCard
                card={entry.item}
              />
            );

          const wrapperClass = isHero ? "col-span-2 lg:col-span-2" : "";

          if (readOnly) {
            return (
              <motion.div
                key={entry.item.id}
                className={wrapperClass}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -10 }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.08,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                layout
              >
                {card}
              </motion.div>
            );
          }

          return (
            <SortableCard key={entry.item.id} id={entry.item.id}>
              <motion.div
                className={wrapperClass}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -10 }}
                transition={{
                  duration: 0.35,
                  delay: index * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              >
                {card}
              </motion.div>
            </SortableCard>
          );
        })}
      </AnimatePresence>

      {/* Placeholder "add" card — more inviting */}
      {!readOnly && (
        <motion.div
          className="flex h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/40 bg-white/50 text-muted-foreground/50 transition-all hover:border-[#C59746]/40 hover:bg-[#C59746]/5 hover:text-muted-foreground/70"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.4,
            delay: orderedItems.length * 0.06 + 0.1,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
            <Plus className="size-5" />
          </div>
          <span className="text-xs font-medium">Add to your trip</span>
          <div className="flex items-center gap-2">
            {[
              { icon: Plane, path: "flights", label: "Flights" },
              { icon: Hotel, path: "hotels", label: "Hotels" },
              { icon: Ship, path: "cruises", label: "Cruises" },
              { icon: Map, path: "tours", label: "Tours" },
            ].map(({ icon: Icon, path, label }) => (
              <Link
                key={path}
                href={`/search/${path}?tripId=${requestId}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-[10px] font-medium text-foreground/60 transition-colors hover:bg-[#C59746]/15 hover:text-[#C59746]"
                onClick={(e) => e.stopPropagation()}
                title={label}
              >
                <Icon className="size-3" />
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Main board content — shrinks when AI panel opens */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero banner — trip destination photo with title overlay */}
        {hasComponents && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <TripBanner
              title={title}
              startDate={startDate}
              endDate={endDate}
              travelers={travelers}
              bannerImage={bannerImage}
              destination={destination}
            />
          </motion.div>
        )}

        {/* Header */}
        <BoardHeader
          title={title}
          componentCount={components.length}
          totalEstimate={totalEstimate}
          readOnly={readOnly}
          requestId={requestId}
          onSubmitClick={() => setShowSubmit(true)}
          aiPanelOpen={aiPanelOpen}
          onAiToggle={() => setAiPanelOpen((prev) => !prev)}
        />

        {/* Mobile AI bar — visible on small screens only */}
        {!readOnly && (
          <div className="lg:hidden">
            <AiMobileBar />
          </div>
        )}

        {/* Add menu */}
        {!readOnly && hasComponents && <BoardAddMenu requestId={requestId} />}

        {/* Empty state */}
        {!hasComponents && <BoardEmptyState requestId={requestId} />}

        {/* Card grid with optional DnD */}
        {hasComponents && (
          readOnly ? (
            cardGrid
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                {cardGrid}
              </SortableContext>
            </DndContext>
          )
        )}
        </div>
      </div>

      {/* Desktop AI panel — side by side, pushes content */}
      {aiPanelOpen && (
        <div className="hidden lg:block">
          <AiBoardPanel
            isOpen={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
