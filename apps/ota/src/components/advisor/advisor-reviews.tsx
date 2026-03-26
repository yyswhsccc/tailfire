import type { AdvisorProfile } from "@/types/advisor";

interface AdvisorReviewsProps {
  advisor: AdvisorProfile;
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className="h-3.5 w-3.5"
          viewBox="0 0 20 20"
          fill={i < rating ? "#C59746" : "#E0E0E0"}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export function AdvisorReviews({ advisor }: AdvisorReviewsProps) {
  if (!advisor.reviews || advisor.reviews.length === 0) return null;

  const visibleReviews = advisor.reviews.slice(0, 3);
  const hasMore = advisor.reviews.length > 3;

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#1A1A1A]">
          What Clients Say
        </h2>

        <div className="mt-4 space-y-4">
          {visibleReviews.map((review, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-white p-5"
            >
              <ReviewStars rating={review.rating} />
              <p className="mt-2.5 text-sm italic leading-relaxed text-muted-foreground">
                &ldquo;{review.text}&rdquo;
              </p>
              <p className="mt-2 text-xs font-semibold text-[#1A1A1A]">
                &mdash; {review.author}
              </p>
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
            >
              See all {advisor.reviews.length} reviews
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
