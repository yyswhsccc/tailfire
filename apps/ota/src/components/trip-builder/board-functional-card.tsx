"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { TripComponent } from "./trip-basket-store";

interface BoardFunctionalCardProps {
  component: TripComponent;
  readOnly: boolean;
  onRemove?: (id: string) => void;
  /** When true, card uses the hero (taller) height for spanning 2 columns. */
  isHero?: boolean;
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "\u2708\uFE0F",
  hotel: "\uD83C\uDFE8",
  cruise: "\uD83D\uDEA2",
  tour: "\uD83D\uDDFA\uFE0F",
  package: "\uD83C\uDF81",
  custom: "\u2728",
};

/** Pixel heights vary by type for masonry visual variety. */
const TYPE_HEIGHT_PX: Record<string, number> = {
  flight: 200,
  hotel: 280,
  cruise: 300,
  tour: 240,
  package: 220,
  custom: 160,
};

/** Hero cards (col-span-2) get extra height. */
const HERO_HEIGHT_PX = 320;

const TYPE_GRADIENT: Record<string, string> = {
  flight: "bg-gradient-to-br from-sky-500 to-sky-700",
  hotel: "bg-gradient-to-br from-amber-500 to-amber-700",
  cruise: "bg-gradient-to-br from-indigo-500 to-indigo-700",
  tour: "bg-gradient-to-br from-emerald-500 to-emerald-700",
  package: "bg-gradient-to-br from-violet-500 to-violet-700",
  custom: "bg-gradient-to-br from-slate-500 to-slate-700",
};

export function BoardFunctionalCard({
  component,
  readOnly,
  onRemove,
  isHero = false,
}: BoardFunctionalCardProps) {
  const [imgError, setImgError] = useState(false);

  const type = component.type;
  const heroImage = component.display?.heroImage;
  const hasImage = heroImage && !imgError;
  const heightPx = isHero
    ? HERO_HEIGHT_PX
    : (TYPE_HEIGHT_PX[type] ?? TYPE_HEIGHT_PX.custom);
  const gradient = TYPE_GRADIENT[type] ?? TYPE_GRADIENT.custom;
  const emoji = TYPE_EMOJI[type] ?? TYPE_EMOJI.custom;

  return (
    <div
      className="group relative rounded-2xl overflow-hidden shadow-md ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
      style={{ height: `${heightPx}px` }}
    >
      {/* Background: image or gradient */}
      {hasImage ? (
        <img
          src={heroImage}
          alt={component.display?.title ?? type}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`absolute inset-0 ${gradient}`} />
      )}

      {/* Gradient overlay for text legibility — stronger for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Type badge - top left — polished with stronger blur */}
      <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
        {emoji} {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>

      {/* Price badge - top right — prominent white pill */}
      {component.display?.price && (
        <span className="absolute top-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#1A1A1A] shadow-sm">
          {component.display.price}
        </span>
      )}

      {/* Remove button - top right, fades in on hover (overlays price when visible) */}
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(component.id);
          }}
          className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
          aria-label={`Remove ${component.display?.title ?? type}`}
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* Content at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className={`font-bold text-white leading-tight ${isHero ? "text-lg" : "text-base"}`}>
          {component.display?.title ??
            type.charAt(0).toUpperCase() + type.slice(1)}
        </p>
        {component.display?.subtitle && (
          <p className="mt-1 text-sm text-white/80 leading-tight">
            {component.display.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
