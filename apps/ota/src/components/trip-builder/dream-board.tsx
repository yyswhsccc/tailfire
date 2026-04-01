"use client";

import { useCallback, useEffect } from "react";
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

export function DreamBoard({
  requestId,
  title,
  components,
  inspiration,
  boardOrder,
  readOnly,
  startDate,
  endDate,
  travelers,
}: DreamBoardProps) {
  const removeComponent = useTripBasket((s) => s.removeComponent);

  // Seed Zustand store from server-fetched data so client mutations
  // (removeComponent, updateBoardOrder) have the requestId they need.
  useEffect(() => {
    useTripBasket.setState({
      requestId,
      title,
      components,
      inspiration,
      boardOrder,
    });
  }, [requestId]); // Only on mount / request change

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <BoardHeader
        title={title}
        componentCount={components.length}
        totalEstimate={totalEstimate}
        readOnly={readOnly}
        requestId={requestId}
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
