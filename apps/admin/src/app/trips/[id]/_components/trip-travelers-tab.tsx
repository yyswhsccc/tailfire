'use client'

import { useState, useMemo } from 'react'
import { Users, AlertTriangle } from 'lucide-react'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { validateContactForTravel, contactFromSnapshot } from '@/lib/snapshot-utils'
import { TravelerAccordionItem } from './traveler-accordion-item'
import type { TripTravelerResponseDto } from '@tailfire/shared-types/api'

// ============================================================================
// useTravelerValidationCount — exported for badge use
// ============================================================================

export function useTravelerValidationCount(
  tripId: string,
  tripStartDate?: string | null
): number {
  const { data: travelers = [] } = useTripTravelers(tripId)
  return useMemo(() => {
    return travelers.reduce((sum, t) => {
      const contact = t.contact || contactFromSnapshot(t.contactSnapshot)
      const validation = validateContactForTravel(contact, tripStartDate)
      return sum + validation.totalIssues
    }, 0)
  }, [travelers, tripStartDate])
}

// ============================================================================
// Sort helpers
// ============================================================================

function getTravelerName(traveler: TripTravelerResponseDto): string {
  const s = traveler.contactSnapshot
  const c = traveler.contact
  const first = c?.firstName ?? s?.firstName ?? ''
  const last = c?.lastName ?? s?.lastName ?? ''
  return `${first} ${last}`.trim().toLowerCase()
}

function sortTravelers(
  travelers: TripTravelerResponseDto[]
): TripTravelerResponseDto[] {
  return [...travelers].sort((a, b) => {
    // 1. Primary traveler first
    if (a.isPrimaryTraveler !== b.isPrimaryTraveler) {
      return a.isPrimaryTraveler ? -1 : 1
    }
    // 2. sequence order ascending
    if (a.sequenceOrder !== b.sequenceOrder) {
      return a.sequenceOrder - b.sequenceOrder
    }
    // 3. name alphabetically
    return getTravelerName(a).localeCompare(getTravelerName(b))
  })
}

// ============================================================================
// TripTravelersTab
// ============================================================================

interface TripTravelersTabProps {
  tripId: string
  tripStartDate?: string | null
  onManageTravelers: () => void
}

export function TripTravelersTab({
  tripId,
  tripStartDate,
  onManageTravelers,
}: TripTravelersTabProps) {
  const { data: travelers = [], isLoading } = useTripTravelers(tripId)
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined)

  // Sort travelers: primary first, then sequenceOrder, then name
  const sortedTravelers = useMemo(() => sortTravelers(travelers), [travelers])

  // Build a Set of all contactIds for relationship filtering within accordion items
  const travelerContactIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>()
    for (const t of travelers) {
      if (t.contactId) ids.add(t.contactId)
    }
    return ids
  }, [travelers])

  // Aggregate validation across all travelers
  const { totalIssues, travelersWithIssues } = useMemo(() => {
    let total = 0
    let withIssues = 0
    for (const t of travelers) {
      const contact = t.contact || contactFromSnapshot(t.contactSnapshot)
      const result = validateContactForTravel(contact, tripStartDate)
      total += result.totalIssues
      if (result.hasIssues) withIssues++
    }
    return { totalIssues: total, travelersWithIssues: withIssues }
  }, [travelers, tripStartDate])

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading travelers...</p>
      </div>
    )
  }

  // ── Empty state ──
  if (sortedTravelers.length === 0) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Travelers (0)</h2>
          <Button size="sm" variant="outline" onClick={onManageTravelers}>
            Manage Travelers
          </Button>
        </div>

        {/* Empty state card */}
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-medium mb-1">No travelers yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Add travelers to this trip to manage their documents and access levels.
          </p>
          <Button size="sm" onClick={onManageTravelers}>
            Manage Travelers
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Travelers ({sortedTravelers.length})
          </h2>
          {travelersWithIssues > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">
              {travelersWithIssues} traveler{travelersWithIssues !== 1 ? 's' : ''} with issues requiring attention
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onManageTravelers}>
          Manage Travelers
        </Button>
      </div>

      {/* ── Validation Summary Banner ── */}
      {totalIssues > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <span className="font-medium">{totalIssues} issue{totalIssues !== 1 ? 's' : ''}</span>{' '}
            found across {travelersWithIssues} traveler{travelersWithIssues !== 1 ? 's' : ''}.
            Expand each traveler to review and resolve missing or expiring documents.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Accordion list ── */}
      <Accordion
        type="single"
        collapsible
        value={expandedId}
        onValueChange={(val) => setExpandedId(val || undefined)}
        className="space-y-0"
      >
        {sortedTravelers.map((traveler) => (
          <TravelerAccordionItem
            key={traveler.id}
            traveler={traveler}
            tripId={tripId}
            tripStartDate={tripStartDate}
            travelerContactIds={travelerContactIds}
            isExpanded={expandedId === traveler.id}
          />
        ))}
      </Accordion>
    </div>
  )
}
