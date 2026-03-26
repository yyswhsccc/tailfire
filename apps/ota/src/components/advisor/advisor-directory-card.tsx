import Link from "next/link";
import Image from "next/image";

import type { AdvisorProfile } from "@/types/advisor";
import { cn } from "@/lib/utils";

interface AdvisorDirectoryCardProps {
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

function getAverageRating(
  reviews?: { rating: number }[],
): { average: number; count: number } | null {
  if (!reviews || reviews.length === 0) return null;
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return { average: total / reviews.length, count: reviews.length };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, rating - i));
        return (
          <svg
            key={i}
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
              fill="#E0E0E0"
            />
            {fill > 0 && (
              <>
                <defs>
                  <clipPath id={`dir-star-clip-${i}-${rating}`}>
                    <rect x="0" y="0" width={fill * 20} height="20" />
                  </clipPath>
                </defs>
                <path
                  d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
                  fill="#C59746"
                  clipPath={`url(#dir-star-clip-${i}-${rating})`}
                />
              </>
            )}
          </svg>
        );
      })}
    </div>
  );
}

export function AdvisorDirectoryCard({ advisor }: AdvisorDirectoryCardProps) {
  const ratingInfo = getAverageRating(advisor.reviews);
  const topSpecialties = advisor.specialties?.slice(0, 3) ?? [];

  return (
    <Link
      href={`/advisor/${advisor.slug}`}
      className={cn(
        "group flex flex-col items-center rounded-xl border border-border bg-white p-6 text-center",
        "transition-shadow hover:shadow-md",
      )}
    >
      {/* Avatar — 48px circular */}
      {advisor.photoUrl ? (
        <div className="relative h-12 w-12 overflow-hidden rounded-full">
          <Image
            src={advisor.photoUrl}
            alt={advisor.displayName}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#C59746] to-[#E89E4A]">
          <span className="text-sm font-bold text-white">
            {getInitials(advisor.displayName)}
          </span>
        </div>
      )}

      {/* Name */}
      <p className="mt-3 font-semibold leading-tight text-[#1A1A1A]">
        {advisor.displayName}
      </p>

      {/* Title */}
      {advisor.title && (
        <p className="mt-0.5 text-xs text-muted-foreground">{advisor.title}</p>
      )}

      {/* Star rating + review count */}
      {ratingInfo && (
        <div className="mt-2 flex items-center gap-1.5">
          <StarRating rating={ratingInfo.average} />
          <span className="text-xs text-muted-foreground">
            {ratingInfo.average.toFixed(1)}{" "}
            <span className="text-border">·</span> {ratingInfo.count}{" "}
            {ratingInfo.count === 1 ? "review" : "reviews"}
          </span>
        </div>
      )}

      {/* Top 3 specialties as small pills */}
      {topSpecialties.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {topSpecialties.map((specialty) => (
            <span
              key={specialty}
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {specialty}
            </span>
          ))}
        </div>
      )}

      {/* View Profile CTA */}
      <span className="mt-4 text-sm font-semibold text-[#C59746] transition-colors group-hover:text-[#E89E4A]">
        View Profile &rarr;
      </span>
    </Link>
  );
}
