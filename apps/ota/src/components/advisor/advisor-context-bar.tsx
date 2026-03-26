import Image from "next/image";
import Link from "next/link";

import type { AdvisorProfile } from "@/types/advisor";

interface AdvisorContextBarProps {
  advisor: AdvisorProfile;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AdvisorContextBar({ advisor }: AdvisorContextBarProps) {
  const firstName = advisor.displayName.split(" ")[0];

  return (
    <div className="bg-[#faf6f0] border-b border-[#e8dfc9]">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Avatar */}
        <div className="shrink-0">
          {advisor.photoUrl ? (
            <div className="relative h-8 w-8 overflow-hidden rounded-full">
              <Image
                src={advisor.photoUrl}
                alt={advisor.displayName}
                fill
                className="object-cover"
                sizes="32px"
              />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#C59746] to-[#E89E4A]">
              <span className="text-[11px] font-bold leading-none text-white">
                {getInitials(advisor.displayName)}
              </span>
            </div>
          )}
        </div>

        {/* Center: heading + subtitle */}
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">
            {firstName}&apos;s Picks
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Handpicked by {advisor.displayName}
          </p>
        </div>

        {/* Right: profile link */}
        <div className="shrink-0">
          <Link
            href={`/advisor/${advisor.slug}`}
            className="text-xs font-semibold text-[#C59746] transition-colors hover:text-[#B08638] whitespace-nowrap"
          >
            View Profile &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
