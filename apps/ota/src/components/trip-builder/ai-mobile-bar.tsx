"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { AiMobileSheet } from "./ai-mobile-sheet";

export function AiMobileBar() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 py-3 transition-colors hover:bg-[#252525] lg:hidden"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-[#C59746]">
          <Sparkles className="size-3.5 text-white" />
        </span>
        <span className="flex-1 text-left text-sm font-medium text-white">
          Ask AI for trip ideas
        </span>
        <ChevronRight className="size-4 text-gray-400" />
      </button>

      <AiMobileSheet isOpen={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
