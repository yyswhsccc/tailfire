"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sparkles } from "lucide-react";

import { ChatPanel } from "./chat-panel";
import { useAiPanelStore } from "@/stores/ai-panel-store";
import { useTripBasket } from "@/components/trip-builder/trip-basket-store";

// ---------------------------------------------------------------------------
// Page context ref — updated by the widget on render, read by custom fetch
// ---------------------------------------------------------------------------
let currentPageContext: {
  type?: string;
  name?: string;
  slug?: string;
  oneLiner?: string;
  bestMonths?: string;
  budgetTier?: string;
  typicalStay?: string;
  tags?: string;
  highlights?: string;
  currency?: string;
  travelTip?: string;
} | undefined;

// Custom fetch that injects pageContext into the request body
const contextFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string' && currentPageContext) {
    try {
      const parsed = JSON.parse(init.body);
      parsed.pageContext = currentPageContext;
      init = { ...init, body: JSON.stringify(parsed) };
    } catch {
      // Not JSON — send as-is
    }
  }
  return globalThis.fetch(input, init);
};

// ---------------------------------------------------------------------------
// Singleton transport with context-aware fetch
// ---------------------------------------------------------------------------
const transport = new DefaultChatTransport({ api: "/api/chat", fetch: contextFetch });

// ---------------------------------------------------------------------------
// Module-level ref so the hero section (Task 6.4) can open the widget
// programmatically with a pre-filled message.
// ---------------------------------------------------------------------------
let openWidgetWithMessage: ((text: string) => void) | null = null;

/**
 * Programmatically open the chat widget and send a message.
 * Intended for use by the homepage hero input (Task 6.4).
 */
export function openChat(text: string) {
  openWidgetWithMessage?.(text);
}

// ---------------------------------------------------------------------------
// ChatWidget
// ---------------------------------------------------------------------------
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const pageContext = useAiPanelStore((s) => s.pageContext);

  // Sync page context to module-level ref so the custom fetch can read it
  useEffect(() => {
    if (!pageContext) {
      currentPageContext = undefined;
      return;
    }
    const meta = pageContext.metadata as Record<string, unknown> | undefined;
    const bestMonths = meta?.bestMonths as string[] | undefined;
    const tags = meta?.tags as string[] | undefined;
    const highlights = meta?.highlights as string[] | undefined;
    const travelTips = meta?.travelTips as string[] | undefined;
    currentPageContext = {
      type: pageContext.type,
      name: pageContext.name,
      slug: pageContext.slug,
      oneLiner: (meta?.oneLiner as string) || undefined,
      bestMonths: bestMonths?.join(', ') || undefined,
      budgetTier: (meta?.budgetTier as string) || undefined,
      typicalStay: (meta?.typicalStay as string) || undefined,
      tags: tags?.join(', ') || undefined,
      highlights: highlights?.join(', ') || undefined,
      currency: (meta?.currencyName as string) || undefined,
      travelTip: travelTips?.[0] || undefined,
    };
  }, [pageContext]);

  const { messages, sendMessage, status } = useChat({ transport });

  // -------------------------------------------------------------------------
  // Sync AI tool results → client-side trip basket store
  // When manageTripBasket or captureIdentity tools complete on the server,
  // apply their effects to the Zustand store (which persists via the API).
  // -------------------------------------------------------------------------
  const processedToolCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        // Tool parts have type "tool-{toolName}" in AI SDK v6
        if (!part.type.startsWith("tool-")) continue;

        const toolName = part.type.replace(/^tool-/, "");
        const toolPart = part as {
          type: string;
          state?: string;
          toolCallId?: string;
          output?: Record<string, unknown>;
        };

        if (toolPart.state !== "output-available" || !toolPart.toolCallId) continue;
        if (processedToolCallIds.current.has(toolPart.toolCallId)) continue;

        const output = toolPart.output;
        if (!output) continue;

        // Mark as processed before async work to prevent duplicates
        processedToolCallIds.current.add(toolPart.toolCallId);

        if (toolName === "manageTripBasket") {
          const action = output.action as string | undefined;
          if (action === "addToBasket" && output.component) {
            const comp = output.component as {
              id: string;
              type: string;
              data: Record<string, unknown>;
              display?: { title?: string; subtitle?: string; price?: string };
            };
            useTripBasket.getState().addComponent({
              id: comp.id,
              type: comp.type as "flight" | "hotel" | "cruise" | "tour",
              data: comp.data,
              display: comp.display,
            });
          } else if (action === "removeFromBasket" && output.componentId) {
            useTripBasket
              .getState()
              .removeComponent(output.componentId as string);
          }
        }

        if (toolName === "captureIdentity") {
          const action = output.action as string | undefined;
          if (action === "linkIdentity" && output.email) {
            useTripBasket
              .getState()
              .linkIdentity(
                output.email as string,
                (output.name as string) || undefined,
                (output.phone as string) || undefined,
              )
              .catch(() => {
                // Identity linking failed — basket may not exist yet
              });
          }
        }
      }
    }
  }, [messages]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage({ text });
    },
    [sendMessage],
  );

  // Stable ref for the programmatic opener callback
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  // Register the programmatic opener so external callers (hero input) can
  // open the widget with a pre-filled message.
  useEffect(() => {
    openWidgetWithMessage = (text: string) => {
      setOpen(true);
      // Small delay to let the panel mount before sending
      setTimeout(() => handleSendRef.current(text), 100);
    };
    return () => {
      openWidgetWithMessage = null;
    };
  }, []);

  return (
    <>
      {/* ---- Panel (desktop: side panel, mobile: full-screen) ---- */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel — starts below navbar (57px) on desktop */}
          <div className="fixed inset-0 z-40 flex flex-col md:inset-auto md:bottom-0 md:right-0 md:top-[57px] md:w-[400px] md:shadow-2xl">
            <ChatPanel
              messages={messages}
              status={status}
              onSend={handleSend}
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}

      {/* ---- Floating toggle button (hidden when panel is open) ---- */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-[#1A1A1A] text-[#C59746] shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open AI concierge chat"
        >
          <Sparkles className="size-5" />
        </button>
      )}
    </>
  );
}
