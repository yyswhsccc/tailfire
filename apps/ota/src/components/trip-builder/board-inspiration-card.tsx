"use client";

import { useState } from "react";
import type { InspirationCard } from "./trip-basket-store";

interface BoardInspirationCardProps {
  card: InspirationCard;
}

/** Derive a stable height between 180-280px from the card id for masonry variety. */
function hashHeight(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return 180 + (Math.abs(hash) % 101); // 180-280
}

export function BoardInspirationCard({ card }: BoardInspirationCardProps) {
  const [imgError, setImgError] = useState(false);
  const height = hashHeight(card.id);

  return (
    <div
      className="group relative rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
      style={{ height: `${height}px` }}
    >
      {card.imageUrl && !imgError ? (
        <img
          src={card.imageUrl}
          alt={card.caption || card.destination}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
          <span className="text-3xl font-light text-muted-foreground/30">
            {card.destination.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      {/* Caption overlay — stronger gradient */}
      {card.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-10">
          <p className="text-xs font-medium text-white/95 leading-tight">
            {card.caption}
          </p>
        </div>
      )}

      {/* Attribution on hover */}
      {card.attribution && (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/40 to-transparent px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-[10px] text-white/70">{card.attribution}</p>
        </div>
      )}
    </div>
  );
}
