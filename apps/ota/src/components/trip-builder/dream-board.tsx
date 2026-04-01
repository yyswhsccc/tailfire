"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import {
  useTripBasket,
  type TripComponent,
  type InspirationCard,
  type BoardOrderItem,
} from "./trip-basket-store";
import { BoardHeader } from "./board-header";
import { BoardAddMenu } from "./board-add-menu";
import { BoardEmptyState } from "./board-empty-state";
import { BoardFunctionalCard } from "./board-functional-card";
import { BoardInspirationCard } from "./board-inspiration-card";
import { SubmitReview } from "./submit-review";

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
    const total = typeof price?.total === "number" ? price.total : 0;
    return sum + total;
  }, 0);
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
  const isIdentified = useTripBasket((s) => s.isIdentified);
  const [showSubmit, setShowSubmit] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <BoardHeader
        title={title}
        componentCount={components.length}
        totalEstimate={totalEstimate}
        readOnly={readOnly}
        requestId={requestId}
        onSubmitClick={() => setShowSubmit(true)}
      />

      {/* Add menu */}
      {!readOnly && hasComponents && <BoardAddMenu requestId={requestId} />}

      {/* Trip metadata hint */}
      {(startDate || endDate || travelers) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {startDate && (
            <span>
              From: <span className="font-medium text-foreground">{startDate}</span>
            </span>
          )}
          {endDate && (
            <span>
              To: <span className="font-medium text-foreground">{endDate}</span>
            </span>
          )}
          {travelers && (
            <span>
              {travelers} traveler{travelers !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasComponents && <BoardEmptyState requestId={requestId} />}

      {/* Masonry grid */}
      {hasComponents && (
        <div className="columns-2 gap-4 md:columns-3">
          {orderedItems.map((entry) =>
            entry.kind === "component" ? (
              <BoardFunctionalCard
                key={entry.item.id}
                component={entry.item}
                readOnly={readOnly}
                onRemove={handleRemove}
              />
            ) : (
              <BoardInspirationCard
                key={entry.item.id}
                card={entry.item}
              />
            ),
          )}

          {/* Placeholder "add" card */}
          {!readOnly && (
            <div className="mb-4 flex h-[160px] break-inside-avoid items-center justify-center rounded-xl border-2 border-dashed border-border/50 text-muted-foreground/40 transition-colors hover:border-border hover:text-muted-foreground/60">
              <Plus className="size-8" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
