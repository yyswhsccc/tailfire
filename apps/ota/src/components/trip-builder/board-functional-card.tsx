"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { TripComponent } from "./trip-basket-store";

interface BoardFunctionalCardProps {
  component: TripComponent;
  readOnly: boolean;
  onRemove?: (id: string) => void;
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "\u2708\uFE0F",
  hotel: "\uD83C\uDFE8",
  cruise: "\uD83D\uDEA2",
  tour: "\uD83D\uDDFA\uFE0F",
  package: "\uD83C\uDF81",
  custom: "\u2728",
};

const TYPE_HEIGHT: Record<string, string> = {
  flight: "h-[200px]",
  hotel: "h-[240px]",
  cruise: "h-[260px]",
  tour: "h-[220px]",
  package: "h-[220px]",
  custom: "h-[180px]",
};

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
}: BoardFunctionalCardProps) {
  const [imgError, setImgError] = useState(false);

  const type = component.type;
  const heroImage = component.display?.heroImage;
  const hasImage = heroImage && !imgError;
  const height = TYPE_HEIGHT[type] ?? TYPE_HEIGHT.custom;
  const gradient = TYPE_GRADIENT[type] ?? TYPE_GRADIENT.custom;
  const emoji = TYPE_EMOJI[type] ?? TYPE_EMOJI.custom;

  return (
    <div
      className={`group relative rounded-xl overflow-hidden transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg ${height}`}
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

      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Type badge - top left */}
      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
        {emoji} {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>

      {/* Price badge - top right */}
      {component.display?.price && (
        <span className="absolute top-2 right-2 rounded-full bg-black/30 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          {component.display.price}
        </span>
      )}

      {/* Remove button - top right, fades in on hover */}
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(component.id);
          }}
          className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
          aria-label={`Remove ${component.display?.title ?? type}`}
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* Content at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-sm font-semibold text-white leading-tight">
          {component.display?.title ??
            type.charAt(0).toUpperCase() + type.slice(1)}
        </p>
        {component.display?.subtitle && (
          <p className="mt-0.5 text-xs text-white/80 leading-tight">
            {component.display.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
