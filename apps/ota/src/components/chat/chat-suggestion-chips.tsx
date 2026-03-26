"use client";

const SUGGESTIONS = [
  "Beach getaway in Mexico",
  "Caribbean cruise",
  "European tour",
  "Talk to an advisor",
] as const;

interface ChatSuggestionChipsProps {
  onSelect: (text: string) => void;
}

export function ChatSuggestionChips({ onSelect }: ChatSuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-full border border-[#C59746] px-3 py-1.5 text-xs font-medium text-[#C59746] transition-colors hover:bg-[#C59746] hover:text-white"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
