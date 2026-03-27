"use client";

import { Sparkles } from "lucide-react";
import { openChat } from "@/components/chat/chat-widget";

interface SearchResultsHeaderProps {
  /** Total count, e.g. 24 */
  count: number;
  /** Noun for the results, e.g. "cruises" */
  noun: string;
  /** Optional search context to pass to AI, e.g. "flights from YOW to CUN on May 15" */
  searchContext?: string;
}

export function SearchResultsHeader({ count, noun, searchContext }: SearchResultsHeaderProps) {
  const handleAskAI = () => {
    const message = searchContext
      ? `I'm looking at ${count} ${noun} results. ${searchContext}. Can you help me find the best option?`
      : `I found ${count} ${noun}. Can you help me compare and pick the best one?`;
    openChat(message);
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground">
        {count} {count === 1 ? noun.replace(/s$/, "") : noun} found
      </p>
      <button
        type="button"
        onClick={handleAskAI}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
        aria-label={`Ask AI about these ${noun}`}
      >
        <Sparkles className="size-3.5" />
        Ask AI about these
      </button>
    </div>
  );
}
