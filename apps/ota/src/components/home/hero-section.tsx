"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { openChat } from "@/components/chat/chat-widget";

export function HeroSection() {
  const [inputValue, setInputValue] = useState("");

  function handleSubmit() {
    const text = inputValue.trim();
    if (!text) return;
    openChat(text);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSubmit();
    }
  }

  return (
    <section className="px-4 py-16 text-center md:py-24">
      <div className="mx-auto max-w-2xl">
        {/* Tagline */}
        <p className="font-display text-xs font-bold uppercase tracking-[3px] text-[#C59746]">
          Discover, Soar, Repeat
        </p>

        {/* Main heading */}
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-5xl">
          Your Journey Starts Here
        </h1>

        {/* Subtitle */}
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          AI-powered travel planning backed by expert advisors
        </p>

        {/* AI chat input */}
        <div className="mt-10">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-[#1A1A1A] px-5 py-4">
            {/* Pulsing gold dot */}
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C59746] opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-[#C59746]" />
            </span>

            {/* Input */}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your dream trip..."
              className="flex-1 bg-transparent text-left text-sm text-white placeholder:text-gray-400 focus:outline-none md:text-base"
              aria-label="Describe your dream trip"
            />

            {/* Send button */}
            <button
              type="button"
              onClick={handleSubmit}
              aria-label="Start planning"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white transition-colors hover:bg-[#B08638] active:scale-95"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
