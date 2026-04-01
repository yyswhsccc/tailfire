"use client";

import { useState } from "react";
import type { InspirationCard } from "./trip-basket-store";

interface BoardInspirationCardProps {
  card: InspirationCard;
}

/** Derive a stable height between 180-240px from the card id. */
function hashHeight(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return 180 + (Math.abs(hash) % 61); // 180–240
}

export function BoardInspirationCard({ card }: BoardInspirationCardProps) {
  const [imgError, setImgError] = useState(false);
  const height = hashHeight(card.id);

  return (
    <div
      className="group relative rounded-xl overflow-hidden transition-transform duration-200 hover:scale-[1.01] hover:brightness-110"
      style={{ height: `${height}px` }}
    >
      {card.imageUrl && !imgError ? (
        <img
          src={card.imageUrl}
          alt={card.caption || card.destination}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <span className="text-2xl text-muted-foreground/40">
            {card.destination.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      {/* Caption overlay */}
      {card.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
          <p className="text-xs font-medium text-white/90 leading-tight">
            {card.caption}
          </p>
        </div>
      )}

      {/* Attribution on hover */}
      {card.attribution && (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/40 to-transparent px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-[10px] text-white/70">{card.attribution}</p>
        </div>
      )}
    </div>
  );
}
