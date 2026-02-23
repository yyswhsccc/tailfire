'use client'

import { useState, useMemo, useCallback } from 'react'
import { Award, Loader2, Users, Save } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { useActivityTravelers, useLinkTravelers } from '@/hooks/use-bookings'
import { useLoyaltyPrograms } from '@/hooks/use-loyalty-programs'
import type { TripTravelerResponseDto, LoyaltyProgramDto } from '@tailfire/shared-types/api'

interface CruisePassengersSectionProps {
  activityId: string | null | undefined
  tripId: string
}

/**
 * Per-passenger loyalty program selector row.
 * Each row fetches the contact's loyalty memberships independently.
 */
function PassengerLoyaltyRow({
  traveler,
  selectedLoyaltyId,
  onLoyaltyChange,
}: {
  traveler: TripTravelerResponseDto
  selectedLoyaltyId: string | null
  onLoyaltyChange: (tripTravelerId: string, loyaltyProgramId: string | null) => void
}) {
  const contactId = traveler.contactId
  const { data: loyaltyPrograms = [], isLoading } = useLoyaltyPrograms(contactId)

  const displayName = traveler.contact
    ? `${traveler.contact.firstName || ''} ${traveler.contact.lastName || ''}`.trim()
    : traveler.contactSnapshot
      ? `${traveler.contactSnapshot.firstName || ''} ${traveler.contactSnapshot.lastName || ''}`.trim()
      : 'Unknown'

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formatLoyaltyOption = (lp: LoyaltyProgramDto) => {
    const parts = [lp.programName]
    if (lp.membershipNumber) parts.push(`#${lp.membershipNumber}`)
    if (lp.tierLevel) parts.push(`(${lp.tierLevel})`)
    return parts.join(' ')
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-cyan-500 text-white text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
        <p className="text-xs text-gray-500 capitalize">{traveler.travelerType}</p>
      </div>

      <div className="w-[280px] flex-shrink-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        ) : loyaltyPrograms.length === 0 ? (
          <span className="text-xs text-gray-400 italic">No loyalty programs</span>
        ) : (
          <Select
            value={selectedLoyaltyId || '__none'}
            onValueChange={(value) =>
              onLoyaltyChange(traveler.id, value === '__none' ? null : value)
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select loyalty program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {loyaltyPrograms.map((lp) => (
                <SelectItem key={lp.id} value={lp.id}>
                  {formatLoyaltyOption(lp)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

export function CruisePassengersSection({
  activityId,
  tripId,
}: CruisePassengersSectionProps) {
  const { toast } = useToast()
  const { data: tripTravelers = [], isLoading: loadingTravelers } = useTripTravelers(tripId)
  const { data: activityTravelers = [], isLoading: loadingActivityTravelers } = useActivityTravelers(activityId)
  const linkTravelers = useLinkTravelers()

  // Track loyalty selections per trip traveler ID
  const [loyaltySelections, setLoyaltySelections] = useState<Record<string, string | null>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Build initial loyalty map from activity travelers
  const initialLoyaltyMap = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const at of activityTravelers) {
      map[at.tripTravelerId] = at.contactLoyaltyProgramId
    }
    return map
  }, [activityTravelers])

  // Merge initial map with local selections
  const effectiveLoyalty = useCallback(
    (tripTravelerId: string): string | null => {
      if (tripTravelerId in loyaltySelections) {
        return loyaltySelections[tripTravelerId] ?? null
      }
      return initialLoyaltyMap[tripTravelerId] ?? null
    },
    [loyaltySelections, initialLoyaltyMap],
  )

  const handleLoyaltyChange = useCallback(
    (tripTravelerId: string, loyaltyProgramId: string | null) => {
      setLoyaltySelections((prev) => ({ ...prev, [tripTravelerId]: loyaltyProgramId }))
      setHasUnsavedChanges(true)
    },
    [],
  )

  const handleSave = async () => {
    if (!activityId) return

    // Build links array from all trip travelers
    const links = tripTravelers.map((t) => ({
      tripTravelerId: t.id,
      contactLoyaltyProgramId: effectiveLoyalty(t.id) || undefined,
    }))

    try {
      await linkTravelers.mutateAsync({
        bookingId: activityId,
        links,
      })
      setHasUnsavedChanges(false)
      toast({
        title: 'Passengers updated',
        description: 'Loyalty program selections have been saved.',
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.'
      toast({
        title: 'Error',
        description: `Failed to update passenger loyalty. ${errorMessage}`,
        variant: 'destructive',
      })
    }
  }

  if (!activityId) {
    return (
      <div className="text-center py-6 text-sm text-gray-400">
        Save the cruise first to manage passenger loyalty programs.
      </div>
    )
  }

  if (loadingTravelers || loadingActivityTravelers) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (tripTravelers.length === 0) {
    return (
      <div className="text-center py-6">
        <Users className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No travelers on this trip yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-phoenix-gold-600" />
          <h4 className="text-sm font-semibold text-gray-700">Passenger Loyalty Programs</h4>
        </div>
        {hasUnsavedChanges && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={linkTravelers.isPending}
          >
            {linkTravelers.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            Save
          </Button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {tripTravelers.map((traveler) => (
          <PassengerLoyaltyRow
            key={traveler.id}
            traveler={traveler}
            selectedLoyaltyId={effectiveLoyalty(traveler.id)}
            onLoyaltyChange={handleLoyaltyChange}
          />
        ))}
      </div>
    </div>
  )
}
