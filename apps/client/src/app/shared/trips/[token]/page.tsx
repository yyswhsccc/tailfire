import type { Metadata } from 'next'
import type { SharedTripProposalDto } from '@tailfire/shared-types'
import { ProposalHero } from './_components/ProposalHero'
import { AgentProfileCard } from './_components/AgentProfileCard'
import { ProposalClientShell } from './_components/ProposalClientShell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

async function fetchTrip(token: string): Promise<SharedTripProposalDto | null> {
  try {
    const res = await fetch(`${API_URL}/trips/share/${token}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const trip = await fetchTrip(token)
  if (!trip) {
    return { title: 'Trip Not Found | Phoenix Voyages' }
  }
  return {
    title: `${trip.name} | Phoenix Voyages`,
    description: trip.description || `Trip proposal from Phoenix Voyages`,
  }
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const trip = await fetchTrip(token)

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Trip Not Found</h1>
          <p className="text-muted-foreground">
            This trip is no longer available or the link has expired.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero (server-rendered) */}
      <ProposalHero
        name={trip.name}
        description={trip.description}
        startDate={trip.startDate}
        endDate={trip.endDate}
        tripType={trip.tripType}
        coverPhotoUrl={trip.coverPhotoUrl}
      />

      {/* Agent profile card (server-rendered) */}
      {trip.agent && <AgentProfileCard agent={trip.agent} />}

      {/* Interactive shell: itinerary, comments, pricing, approval */}
      <ProposalClientShell trip={trip} token={token} />

      {/* Footer spacing */}
      <div className="pb-16" />
    </div>
  )
}
