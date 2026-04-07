import type { AdvisorProfile } from '@/types/advisor'

interface AdvisorTestimonialsProps {
  advisor: AdvisorProfile
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill={i < rating ? '#C59746' : '#D4C5A9'}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </div>
  )
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function AdvisorTestimonials({ advisor }: AdvisorTestimonialsProps) {
  if (!advisor.reviews || advisor.reviews.length === 0) return null

  return (
    <section style={{ backgroundColor: '#faf6f0' }} className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="mb-8 text-center">
          <h2 className="font-display text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl">
            What Clients Say
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Real experiences from travellers who&apos;ve planned with{' '}
            {advisor.displayName.split(' ')[0]}
          </p>
        </div>

        {/* Testimonials grid: 3 col desktop, 2 tablet, 1 mobile */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {advisor.reviews.map((review, index) => (
            <div
              key={index}
              className="flex flex-col rounded-2xl border border-[#E8DFD0] bg-white p-6 shadow-sm"
            >
              {/* Stars */}
              <ReviewStars rating={review.rating} />

              {/* Quote */}
              <p className="mt-4 flex-1 text-sm italic leading-relaxed text-[#4A4A4A]">
                &ldquo;{review.text}&rdquo;
              </p>

              {/* Author */}
              <div className="mt-5 flex items-center gap-3">
                {/* Avatar initials */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C59746] to-[#E89E4A]">
                  <span className="text-xs font-bold text-white">
                    {getInitials(review.author)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-[#1A1A1A]">
                  {review.author}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
