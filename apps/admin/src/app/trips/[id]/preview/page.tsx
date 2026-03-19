'use client'

import { useParams, useRouter } from 'next/navigation'
import { Cinzel, Lato } from 'next/font/google'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePreviewProposal } from '@/hooks/use-trips'
import { ProposalHero, AgentProfileCard, ProposalShell } from '@tailfire/trip-proposal-ui'

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-body',
  display: 'swap',
})

export default function TripPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params?.id as string

  const { data: trip, isLoading, error } = usePreviewProposal(tripId)

  if (isLoading) {
    return (
      <div className={`${cinzel.variable} ${lato.variable} min-h-screen bg-background`}>
        <PreviewBanner onBack={() => router.push(`/trips/${tripId}`)} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Loading preview...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className={`${cinzel.variable} ${lato.variable} min-h-screen bg-background`}>
        <PreviewBanner onBack={() => router.push(`/trips/${tripId}`)} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3 max-w-md mx-auto px-4">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold">Unable to load preview</h2>
            <p className="text-muted-foreground text-sm">
              {error instanceof Error
                ? error.message
                : 'The trip may not have any itineraries yet. Add at least one itinerary to preview.'}
            </p>
            <Button variant="outline" onClick={() => router.push(`/trips/${tripId}`)}>
              Back to Editor
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${cinzel.variable} ${lato.variable} min-h-screen bg-background`}>
      <PreviewBanner onBack={() => router.push(`/trips/${tripId}`)} />

      <ProposalHero
        name={trip.name}
        description={trip.description}
        startDate={trip.startDate}
        endDate={trip.endDate}
        tripType={trip.tripType}
        coverPhotoUrl={trip.coverPhotoUrl}
      />

      {trip.agent && (
        <AgentProfileCard agent={trip.agent} />
      )}

      <ProposalShell
        trip={trip}
        isPreview
        showPricing={trip.pricingVisible}
      />

      {/* Bottom spacer */}
      <div className="h-16" />
    </div>
  )
}

function PreviewBanner({ onBack }: { onBack: () => void }) {
  return (
    <div className="sticky top-0 z-50 bg-amber-500/90 backdrop-blur text-black">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          <span>Preview Mode</span>
          <span className="text-black/60 hidden sm:inline">— This is how your client will see the proposal</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 bg-white/20 border-black/20 text-black hover:bg-white/30"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Editor
        </Button>
      </div>
    </div>
  )
}
