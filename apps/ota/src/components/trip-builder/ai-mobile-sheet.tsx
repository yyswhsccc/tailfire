"use client";

import { useRef } from "react";
import { Sparkles, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { openChat } from "@/components/chat/chat-widget";

interface AiMobileSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const MOBILE_PROMPTS = [
  { label: "Suggest a hotel", message: "Suggest a hotel near my trip destination", icon: "🏨" },
  { label: "Find activities", message: "Find activities and things to do near my hotel", icon: "🎯" },
  { label: "Help me plan", message: "Help me plan my dream trip!", icon: "✨" },
  { label: "Budget tips", message: "Help me optimize my trip budget", icon: "💰" },
];

export function AiMobileSheet({ isOpen, onOpenChange }: AiMobileSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePromptClick(message: string) {
    onOpenChange(false);
    openChat(message);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    onOpenChange(false);
    openChat(text);
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl bg-[#1A1A1A] px-0 pb-0"
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <SheetHeader className="px-5 pb-4">
          <SheetTitle className="flex items-center gap-2 text-white">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#C59746]">
              <Sparkles className="size-3.5 text-white" />
            </span>
            AI Concierge
          </SheetTitle>
          <SheetDescription className="text-gray-400">
            Get AI-powered suggestions for your dream trip
          </SheetDescription>
        </SheetHeader>

        {/* Quick prompts */}
        <div className="grid grid-cols-2 gap-2 px-5 pb-4">
          {MOBILE_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => handlePromptClick(prompt.message)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
            >
              <span className="text-base" role="img" aria-label={prompt.label}>
                {prompt.icon}
              </span>
              <span className="text-xs font-medium text-gray-200">
                {prompt.label}
              </span>
            </button>
          ))}
        </div>

        {/* Chat input */}
        <div className="border-t border-white/10 px-5 py-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask anything about your trip..."
              autoComplete="off"
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            />
            <button
              type="submit"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white transition-colors hover:bg-[#B08636]"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
