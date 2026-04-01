"use client";

import { X, Sparkles, MessageSquare, ChevronRight } from "lucide-react";
import { openChat } from "@/components/chat/chat-widget";

interface AiBoardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  {
    label: "Suggest a hotel",
    message: "Suggest a hotel near my trip destination",
    icon: "🏨",
  },
  {
    label: "Find activities",
    message: "Find activities and things to do near my hotel",
    icon: "🎯",
  },
  {
    label: "Best time to visit",
    message: "What's the best time to visit my destination?",
    icon: "🌤️",
  },
  {
    label: "Budget tips",
    message: "Help me optimize my trip budget",
    icon: "💰",
  },
  {
    label: "Local dining",
    message: "Recommend restaurants near my trip location",
    icon: "🍽️",
  },
  {
    label: "Packing list",
    message: "What should I pack for this trip?",
    icon: "🧳",
  },
];

export function AiBoardPanel({ isOpen, onClose }: AiBoardPanelProps) {
  if (!isOpen) return null;

  function handlePromptClick(message: string) {
    openChat(message);
  }

  function handleOpenChat() {
    openChat("Help me plan my dream trip!");
  }

  return (
    <div className="sticky top-16 flex h-[calc(100vh-4rem)] w-[400px] shrink-0 flex-col rounded-l-2xl bg-[#1A1A1A] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#C59746]">
            <Sparkles className="size-4 text-white" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">
              AI Concierge
            </h2>
            <p className="text-xs text-[#C59746]">Trip planning assistant</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close AI panel"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {/* Welcome message */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#C59746]/10">
            <Sparkles className="size-6 text-[#C59746]" />
          </div>
          <p className="text-sm font-medium text-white">
            Ask me about your trip!
          </p>
          <p className="mt-1 text-xs text-gray-400">
            I can help find hotels, activities, restaurants, and more based on
            your dream board.
          </p>
        </div>

        {/* Quick prompts */}
        <div className="space-y-2">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
            Quick suggestions
          </p>
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => handlePromptClick(prompt.message)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
            >
              <span className="text-base" role="img" aria-label={prompt.label}>
                {prompt.icon}
              </span>
              <span className="flex-1 text-sm text-gray-200">
                {prompt.label}
              </span>
              <ChevronRight className="size-4 text-gray-500" />
            </button>
          ))}
        </div>
      </div>

      {/* Footer — open full chat */}
      <div className="border-t border-white/10 px-5 py-4">
        <button
          type="button"
          onClick={handleOpenChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C59746] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#B08636]"
        >
          <MessageSquare className="size-4" />
          Open Full Chat
        </button>
      </div>
    </div>
  );
}
