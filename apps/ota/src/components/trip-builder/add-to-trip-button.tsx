"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        variant={isAlreadyAdded || justAdded ? "secondary" : "default"}
        size={size}
        className={className}
        disabled={isAlreadyAdded || isLoading}
        onClick={handleClick}
      >
        {isLoading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : isAlreadyAdded || justAdded ? (
          <Check className="mr-1 h-3.5 w-3.5" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        {isAlreadyAdded ? "Added" : justAdded ? "Added!" : "Add to Trip"}
      </Button>

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
