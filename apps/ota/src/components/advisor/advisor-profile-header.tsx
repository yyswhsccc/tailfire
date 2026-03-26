import Image from "next/image";

import type { AdvisorProfile } from "@/types/advisor";

interface AdvisorProfileHeaderProps {
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
    <div className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, rating - i));
        return (
          <svg
            key={i}
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background (empty) star */}
            <path
              d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
              fill="#E0E0E0"
            />
            {/* Filled portion */}
            {fill > 0 && (
              <>
                <defs>
                  <clipPath id={`star-clip-${i}`}>
                    <rect x="0" y="0" width={fill * 20} height="20" />
                  </clipPath>
                </defs>
                <path
                  d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
                  fill="#C59746"
                  clipPath={`url(#star-clip-${i})`}
                />
              </>
            )}
          </svg>
        );
      })}
    </div>
  );
}

export function AdvisorProfileHeader({ advisor }: AdvisorProfileHeaderProps) {
  const ratingInfo = getAverageRating(advisor.reviews);
  const firstName = advisor.displayName.split(" ")[0];

  return (
    <section className="px-4 pb-8 pt-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* Avatar */}
        {advisor.photoUrl ? (
          <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full">
            <Image
              src={advisor.photoUrl}
              alt={advisor.displayName}
              fill
              className="object-cover"
              sizes="72px"
              priority
            />
          </div>
        ) : (
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#C59746] to-[#E89E4A]">
            <span className="text-xl font-bold text-white">
              {getInitials(advisor.displayName)}
            </span>
          </div>
        )}

        {/* Name */}
        <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-[#1A1A1A]">
          {advisor.displayName}
        </h1>

        {/* Title */}
        {advisor.title && (
          <p className="mt-1 text-sm font-medium text-[#C59746]">
            {advisor.title}
          </p>
        )}

        {/* Star rating + review count */}
        {ratingInfo && (
          <div className="mt-2 flex items-center gap-2">
            <StarRating rating={ratingInfo.average} />
            <span className="text-sm text-muted-foreground">
              {ratingInfo.average.toFixed(1)} ({ratingInfo.count}{" "}
              {ratingInfo.count === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}

        {/* Specialty badges */}
        {advisor.specialties && advisor.specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {advisor.specialties.map((specialty) => (
              <span
                key={specialty}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {specialty}
              </span>
            ))}
          </div>
        )}

        {/* Languages */}
        {advisor.languages && advisor.languages.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Speaks: {advisor.languages.join(", ")}
          </p>
        )}

        {/* CTAs */}
        <div className="mt-6 flex items-center gap-3">
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Contact {firstName}
          </a>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
            title="Coming soon"
          >
            Ask AI
          </button>
        </div>
      </div>
    </section>
  );
}
