"use client";

import { Plus } from "lucide-react";

interface AiSuggestion {
  type: string;
  title: string;
  subtitle?: string;
  price?: string;
}

interface AiSuggestionCardProps {
  suggestion: AiSuggestion;
  onAdd: () => void;
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  cruise: "🚢",
  tour: "🎯",
  activity: "🎭",
  restaurant: "🍽️",
  transport: "🚗",
};

export function AiSuggestionCard({ suggestion, onAdd }: AiSuggestionCardProps) {
  const emoji = TYPE_EMOJI[suggestion.type] ?? "✨";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <span className="text-lg" role="img" aria-label={suggestion.type}>
        {emoji}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {suggestion.title}
        </p>
        {(suggestion.subtitle || suggestion.price) && (
          <p className="truncate text-xs text-gray-400">
            {suggestion.subtitle}
            {suggestion.subtitle && suggestion.price && " · "}
            {suggestion.price && (
              <span className="text-[#C59746]">{suggestion.price}</span>
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white transition-colors hover:bg-[#B08636]"
        aria-label={`Add ${suggestion.title}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
