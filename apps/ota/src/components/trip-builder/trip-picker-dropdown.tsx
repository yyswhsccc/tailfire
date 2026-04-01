"use client";

import { Plus } from "lucide-react";

import { useTripBasket, type TripComponent } from "./trip-basket-store";

interface TripPickerDropdownProps {
  component: TripComponent;
  onClose: () => void;
  onAdded: () => void;
}

export function TripPickerDropdown({
  component,
  onClose,
  onAdded,
}: TripPickerDropdownProps) {
  const drafts = useTripBasket((s) => s.drafts);
  const sessionId = useTripBasket((s) => s.sessionId);
  const setActiveRequest = useTripBasket((s) => s.setActiveRequest);
  const addComponent = useTripBasket((s) => s.addComponent);
  const createDraft = useTripBasket((s) => s.createDraft);

  async function handlePickDraft(draftId: string) {
    setActiveRequest(draftId);
    await addComponent(component);
    onAdded();
    onClose();
  }

  async function handleNewTrip() {
    if (sessionId) {
      await createDraft(component, sessionId);
      onAdded();
    }
    onClose();
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg">
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Add to...
      </div>

      {drafts.map((draft) => (
        <button
          key={draft.id}
          type="button"
          onClick={() => handlePickDraft(draft.id)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
        >
          <span className="truncate font-medium">
            {draft.title ?? "Untitled Trip"}
          </span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {draft.componentCount} item{draft.componentCount !== 1 ? "s" : ""}
          </span>
        </button>
      ))}

      <div className="border-t border-border" />

      <button
        type="button"
        onClick={handleNewTrip}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        New Trip
      </button>
    </div>
  );
}
