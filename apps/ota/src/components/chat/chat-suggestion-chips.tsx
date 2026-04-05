"use client";

import { useAiPanelStore } from "@/stores/ai-panel-store";

interface ChatSuggestionChipsProps {
  onSelect: (text: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  "I'm dreaming of a beach vacation",
  "Help me plan a cruise",
  "Where should I go this summer?",
  "Talk to a travel advisor",
] as const;

const CONTEXT_SUGGESTIONS: Record<string, (name: string) => string[]> = {
  destination: (name) => [
    `What's the best time to visit ${name}?`,
    `Find me a cruise that stops in ${name}`,
    `What should I not miss in ${name}?`,
    `Help me plan a week in ${name}`,
  ],
  ship: (name) => [
    `Tell me about ${name}`,
    `What are the best cabins on ${name}?`,
    `Find me a sailing on ${name}`,
    `What's included on this ship?`,
  ],
  sailing: (_name) => [
    `What ports does this cruise visit?`,
    `Help me pick the right cabin`,
    `What's the best deal for this sailing?`,
    `I'm interested — what's next?`,
  ],
  cruise_line: (name) => [
    `What makes ${name} special?`,
    `Compare ${name} ships for me`,
    `Find me the best ${name} deal`,
    `Which ${name} ship is best for families?`,
  ],
  region: (name) => [
    `Plan a ${name} itinerary for me`,
    `What's the best cruise in ${name}?`,
    `When should I visit ${name}?`,
    `Hidden gems in ${name}?`,
  ],
  deal: (_name) => [
    `Tell me more about this offer`,
    `Is this a good deal?`,
    `Help me take advantage of this`,
    `What else is included?`,
  ],
};

export function ChatSuggestionChips({ onSelect }: ChatSuggestionChipsProps) {
  const pageContext = useAiPanelStore((s) => s.pageContext);

  const suggestions =
    pageContext?.type && CONTEXT_SUGGESTIONS[pageContext.type]
      ? CONTEXT_SUGGESTIONS[pageContext.type]!(pageContext.name)
      : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {suggestions.map((suggestion) => (
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
