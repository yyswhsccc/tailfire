"use client";

import { useRef, useEffect } from "react";
import { X, Sparkles, Send, Loader2 } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";

import { ChatSuggestionChips } from "./chat-suggestion-chips";
import { ChatProductCards } from "./chat-product-cards";

// ---------------------------------------------------------------------------
// Friendly tool-name mapping
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  searchFlights: "flights",
  searchHotels: "hotels",
  searchCruises: "cruises",
  browseTours: "tours",
  captureContact: "contact info",
  requestAdvisor: "advisor request",
  manageTripBasket: "trip basket",
  captureIdentity: "identity",
};

/** Tool names that render as rich product cards */
const SEARCH_TOOLS = new Set([
  "searchCruises",
  "searchFlights",
  "searchHotels",
  "browseTours",
]);

function toolLabel(partType: string): string {
  // part.type is "tool-searchFlights", strip "tool-" prefix
  const toolName = partType.replace(/^tool-/, "");
  return TOOL_LABELS[toolName] ?? toolName;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ChatPanelProps {
  messages: UIMessage[];
  status: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChatPanel({ messages, status, onSend, onClose }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const text = input.value.trim();
    if (!text || isLoading) return;
    onSend(text);
    input.value = "";
  }

  function handleChipSelect(text: string) {
    onSend(text);
  }

  return (
    <div className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between bg-[#1A1A1A] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#C59746]">
            <Sparkles className="size-4 text-white" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">Phoenix AI</h2>
            <p className="text-xs text-[#C59746]">Your Travel Concierge</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close chat"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* ---- Message area ---- */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-[#fafafa] px-4 py-4 space-y-4"
      >
        {/* Welcome / suggestion chips when empty */}
        {!hasMessages && (
          <div className="flex flex-col items-center gap-4 pt-8">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#C59746]/10">
              <Sparkles className="size-6 text-[#C59746]" />
            </span>
            <div className="text-center">
              <p className="text-sm font-medium text-[#1A1A1A]">
                How can I help you plan your trip?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search flights, hotels, cruises, or ask anything about travel.
              </p>
            </div>
            <ChatSuggestionChips onSelect={handleChipSelect} />
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => {
          // Split parts into inline (text, non-search tool states) and
          // product card parts (search tool output) which render full-width.
          const inlineParts: Array<{ part: (typeof message.parts)[number]; idx: number }> = [];
          const cardParts: Array<{ part: (typeof message.parts)[number]; idx: number }> = [];

          message.parts.forEach((part, idx) => {
            if (part.type.startsWith("tool-")) {
              const toolName = part.type.replace(/^tool-/, "");
              const state = (part as { state?: string }).state;
              const output = (part as { output?: unknown }).output;
              if (
                state === "output-available" &&
                output &&
                SEARCH_TOOLS.has(toolName)
              ) {
                cardParts.push({ part, idx });
                return;
              }
            }
            inlineParts.push({ part, idx });
          });

          // Check if inline parts have any visible content (to avoid empty bubbles)
          const hasInlineContent = inlineParts.some(({ part }) => {
            if (part.type === "text" && part.text.trim()) return true;
            if (part.type.startsWith("tool-")) return true;
            return false;
          });

          return (
            <div key={message.id}>
              {/* Standard message bubble — only render if there's inline content */}
              {hasInlineContent && (
              <div
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {/* AI avatar */}
                {message.role === "assistant" && (
                  <span className="mr-2 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C59746]">
                    <Sparkles className="size-3.5 text-white" />
                  </span>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-[#1A1A1A] text-white"
                      : "border border-border bg-white text-[#1A1A1A]"
                  }`}
                >
                  {inlineParts.map(({ part, idx: i }) => {
                    if (part.type === "text" && part.text.trim()) {
                      return (
                        <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const label = toolLabel(part.type);
                      const toolName = part.type.replace(/^tool-/, "");
                      const state = (part as { state?: string }).state;
                      if (state === "output-available") {
                        // Non-search tool completed (captureContact, requestAdvisor, etc.)
                        const DONE_TOOLS = new Set([
                          "captureContact",
                          "requestAdvisor",
                          "manageTripBasket",
                          "captureIdentity",
                        ]);
                        return (
                          <div
                            key={`${message.id}-${i}`}
                            className="mt-1 text-xs text-green-600"
                          >
                            {DONE_TOOLS.has(toolName)
                              ? `Done`
                              : `Found ${label} results`}
                          </div>
                        );
                      }
                      if (state === "output-error") {
                        return (
                          <div
                            key={`${message.id}-${i}`}
                            className="mt-1 text-xs text-destructive"
                          >
                            Error searching {label}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`${message.id}-${i}`}
                          className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <Loader2 className="size-3 animate-spin" />
                          Searching {label}...
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
              )}

              {/* Product cards rendered full-width below the bubble */}
              {cardParts.map(({ part, idx: i }) => {
                const toolName = part.type.replace(/^tool-/, "");
                const output = (part as { output?: unknown }).output;
                return (
                  <div key={`${message.id}-card-${i}`} className="ml-9 mt-1">
                    <ChatProductCards toolName={toolName} output={output} />
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Typing indicator when submitted (before streaming starts) */}
        {status === "submitted" && (
          <div className="flex justify-start">
            <span className="mr-2 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C59746]">
              <Sparkles className="size-3.5 text-white" />
            </span>
            <div className="rounded-2xl border border-border bg-white px-4 py-3">
              <div className="flex gap-1">
                <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Input area ---- */}
      <div className="border-t border-border bg-white px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            name="message"
            type="text"
            placeholder="Type a message..."
            disabled={isLoading}
            autoComplete="off"
            className="flex-1 rounded-full border border-border bg-[#fafafa] px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-muted-foreground focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white transition-colors hover:bg-[#B08638] disabled:opacity-50"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
