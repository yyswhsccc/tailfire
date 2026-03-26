import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ContentPageProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function ContentPage({ title, children, className }: ContentPageProps) {
  return (
    <div className={cn("mx-auto max-w-3xl px-4 pt-16 pb-24 sm:px-6 lg:px-8", className)}>
      <h1 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
        {title}
      </h1>
      <div className="mt-8 space-y-6 text-base leading-relaxed text-[#1A1A1A]/80">
        {children}
      </div>
    </div>
  );
}
