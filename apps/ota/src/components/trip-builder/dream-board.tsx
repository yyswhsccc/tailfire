"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-auto">
      {orderedItems.map((entry) => {
        const card =
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
          );

        if (readOnly) return <div key={entry.item.id}>{card}</div>;

        return (
          <SortableCard key={entry.item.id} id={entry.item.id}>
            {card}
          </SortableCard>
        );
      })}

      {/* Placeholder "add" card */}
      {!readOnly && (
        <div className="flex h-[160px] items-center justify-center rounded-xl border-2 border-dashed border-border/50 text-muted-foreground/40 transition-colors hover:border-border hover:text-muted-foreground/60">
          <Plus className="size-8" />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`space-y-6 transition-[margin] duration-300 ${
          aiPanelOpen ? "lg:mr-[400px]" : ""
        }`}
      >
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

      {/* Desktop AI panel — slides out from right */}
      <AiBoardPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
      />
    </>
  );
}
