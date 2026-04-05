"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sparkles } from "lucide-react";

import { ChatPanel } from "./chat-panel";
import { useAiPanelStore } from "@/stores/ai-panel-store";

// ---------------------------------------------------------------------------
// Page context ref — updated by the widget on render, read by custom fetch
// ---------------------------------------------------------------------------
let currentPageContext: { type?: string; name?: string; slug?: string } | undefined;

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
    currentPageContext = pageContext
      ? { type: pageContext.type, name: pageContext.name, slug: pageContext.slug }
      : undefined;
  }, [pageContext]);

  const { messages, sendMessage, status } = useChat({ transport });

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
