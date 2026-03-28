"use client";

import { useRouter } from "next/navigation";
import { useCallback, type FormEvent } from "react";
import { Search, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSearch } from "./search-page-shell";

interface TourSearchFormProps {
  currentQ?: string;
  className?: string;
}

export function TourSearchForm({ currentQ = "", className }: TourSearchFormProps) {
  const router = useRouter();
  const { isPending, startSearch } = useSearch();

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const q = (form.get("q") as string)?.trim();

      const params = new URLSearchParams();
      if (q) params.set("q", q);

      const qs = params.toString();
      startSearch(() => {
        router.push(`/search/tours${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [router, startSearch],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          type="text"
          defaultValue={currentQ}
          placeholder="Search by destination, theme, or operator..."
          className="h-10 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] focus-visible:ring-3 focus-visible:ring-[#C59746]/50",
          isPending && "cursor-not-allowed opacity-70",
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <Search className="size-4" />
            Search
          </>
        )}
      </button>
    </form>
  );
}
