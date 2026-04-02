"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Check, Loader2 } from "lucide-react";

import { useTripBasket, type TripComponent } from "./trip-basket-store";
import { TripPickerDropdown } from "./trip-picker-dropdown";

interface AddToTripButtonProps {
  component: TripComponent;
  size?: "sm" | "default";
  className?: string;
}

export function AddToTripButton({
  component,
  size = "sm",
  className,
}: AddToTripButtonProps) {
  const components = useTripBasket((s) => s.components);
  const drafts = useTripBasket((s) => s.drafts);
  const addComponent = useTripBasket((s) => s.addComponent);
  const isLoading = useTripBasket((s) => s.isLoading);

  const [showPicker, setShowPicker] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAlreadyAdded = components.some((c) => c.id === component.id);

  // Close picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPicker]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleAdded() {
    setJustAdded(true);
    timerRef.current = setTimeout(() => setJustAdded(false), 1500);
  }

  async function handleClick() {
    if (isAlreadyAdded || justAdded) return;

    // Multiple drafts -> show picker
    if (drafts.length > 1) {
      setShowPicker((prev) => !prev);
      return;
    }

    // Single or no draft -> add directly
    await addComponent(component);
    handleAdded();
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Use a div styled as button to avoid nested <button> inside flight card <button> */}
      <div
        role="button"
        tabIndex={0}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg text-xs font-medium transition-colors cursor-pointer select-none ${
          size === "sm" ? "h-7 gap-1 px-2.5" : "h-8 gap-1.5 px-3"
        } ${
          isAlreadyAdded || justAdded
            ? "bg-muted text-muted-foreground"
            : "bg-[#C59746] text-white hover:bg-[#B08638]"
        } ${isAlreadyAdded || isLoading ? "pointer-events-none opacity-60" : ""} ${className || ""}`}
        onClick={isAlreadyAdded || isLoading ? undefined : handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      >
        {isLoading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : isAlreadyAdded || justAdded ? (
          <Check className="mr-1 h-3.5 w-3.5" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        {isAlreadyAdded ? "Added" : justAdded ? "Added!" : "Add to Trip"}
      </div>

      {showPicker && (
        <TripPickerDropdown
          component={component}
          onClose={() => setShowPicker(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
