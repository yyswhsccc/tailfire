'use client'

import { Badge } from '@tailfire/ui-public'

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function ProposalHero({
  name,
  description,
  startDate,
  endDate,
  tripType,
  coverPhotoUrl,
}: {
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  tripType: string | null
  coverPhotoUrl: string | null
}) {
  return (
    <div className="relative">
      {/* Cover photo with text overlay inside */}
      {coverPhotoUrl ? (
        <div className="w-full min-h-64 md:min-h-80 relative">
          <img
            src={coverPhotoUrl}
            alt={name}
            className="w-full h-full object-cover absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-phoenix-charcoal via-phoenix-charcoal/60 to-phoenix-charcoal/10" />
          {/* Content positioned inside the gradient */}
          <div className="relative z-10 flex flex-col justify-end h-full min-h-64 md:min-h-80 px-4 pb-8 pt-16">
            <div className="max-w-3xl mx-auto w-full">
              {tripType && (
                <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">
                  {tripType}
                </Badge>
              )}
              <h1 className="font-display text-3xl md:text-4xl font-bold text-white text-shadow-hero mb-2">
                {name}
              </h1>
              {(startDate || endDate) && (
                <p className="text-white/80 text-lg text-shadow-hero">
                  {formatDate(startDate)}
                  {startDate && endDate && ' — '}
                  {formatDate(endDate)}
                </p>
              )}
              {description && (
                <p className="text-white/80 mt-3 leading-relaxed text-shadow-hero">{description}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full min-h-40 md:min-h-56 bg-gradient-to-br from-primary/20 via-phoenix-charcoal to-phoenix-charcoal relative">
          <div className="flex flex-col justify-end h-full min-h-40 md:min-h-56 px-4 pb-8 pt-16">
            <div className="max-w-3xl mx-auto w-full">
              {tripType && (
                <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">
                  {tripType}
                </Badge>
              )}
              <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">
                {name}
              </h1>
              {(startDate || endDate) && (
                <p className="text-white/80 text-lg">
                  {formatDate(startDate)}
                  {startDate && endDate && ' — '}
                  {formatDate(endDate)}
                </p>
              )}
              {description && (
                <p className="text-white/80 mt-3 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
