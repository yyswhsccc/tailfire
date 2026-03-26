import Image from "next/image";
import Link from "next/link";

import type { Deal } from "@/types/deal";

interface DealHeroProps {
  deal: Deal;
}

export function DealHero({ deal }: DealHeroProps) {
  return (
    <div className="relative h-72 w-full md:h-96">
      {/* Background: hero image or golden hour gradient fallback */}
      {deal.heroImageUrl ? (
        <Image
          src={deal.heroImageUrl}
          alt={deal.title}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #E89E4A 0%, #C59746 40%, #1A1A1A 100%)",
          }}
        />
      )}

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Top navigation: back + share */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
        <Link
          href="/deals"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          aria-label="Back to deals"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          aria-label="Share deal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" x2="12" y1="2" y2="15" />
          </svg>
        </button>
      </div>

      {/* LIMITED TIME badge */}
      {deal.validUntil && (
        <div className="absolute left-4 top-14">
          <span className="rounded-md bg-[#B33939] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
            Limited Time
          </span>
        </div>
      )}

      {/* Bottom overlay text */}
      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
        {deal.supplierName && (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C59746]">
            {deal.supplierName}
          </p>
        )}
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-white md:text-3xl">
          {deal.title}
        </h1>
      </div>
    </div>
  );
}
