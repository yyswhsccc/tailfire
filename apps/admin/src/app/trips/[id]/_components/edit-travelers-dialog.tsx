'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, InfoIcon, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTripTravelers, useCreateTripTraveler } from '@/hooks/use-trip-travelers'
import { useContacts } from '@/hooks/use-contacts'
import { useRelationshipSuggestions } from '@/hooks/use-family-suggestions'
import { useToast } from '@/hooks/use-toast'
import { inferTravelerTypeFromRelationship } from '@/lib/relationship-utils'
import { getRelationshipCategoryLabel } from '@/lib/relationship-constants'
import { TravelerRow } from './traveler-row'
import { InlineContactForm } from './inline-contact-form'
import { ContactSearchResult } from './contact-search-result'
import type { TripResponseDto } from '@tailfire/shared-types/api'

interface EditTravelersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: TripResponseDto
}

export function EditTravelersDialog({
  open,
  onOpenChange,
  trip,
}: EditTravelersDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [addToActivities, setAddToActivities] = useState(true)
  const [showInlineForm, setShowInlineForm] = useState(false)
  const [addedFamilyIds, setAddedFamilyIds] = useState<Set<string>>(new Set())
  const [showAllRelationships, setShowAllRelationships] = useState(false)

  // Fetch travelers for this trip
  const { data: travelers = [], isLoading: loadingTravelers } = useTripTravelers(trip.id)

  // Search contacts when user types
  const { data: contactsData, isLoading: loadingContacts } = useContacts({
    search: searchQuery.trim(),
    limit: 10,
  })

  // Get IDs of contacts already added as travelers (memoized to prevent re-renders)
  const existingContactIds = useMemo(() => {
    return new Set(travelers.map((t) => t.contactId).filter((id): id is string => id !== null))
  }, [travelers])

  // Derive primary contact ID from primary traveler (fallback to trip.primaryContactId)
  // This allows relationship suggestions to work even when trip.primaryContactId is not set
  const primaryTravelerContactId = useMemo(() => {
    // Don't compute until travelers are loaded to avoid flicker
    if (loadingTravelers) return null
    // Find first traveler marked as primary (consistent ordering)
    const primaryTraveler = travelers.find((t) => t.isPrimaryTraveler)
    return primaryTraveler?.contactId || trip.primaryContactId || null
  }, [travelers, loadingTravelers, trip.primaryContactId])

  // Fetch relationship suggestions based on primary traveler's contact, filtered by existing travelers
  const { suggestions: relationshipSuggestions, hasRelationships } = useRelationshipSuggestions(
    primaryTravelerContactId,
    existingContactIds,
    showAllRelationships
  )

  // Hooks for adding travelers
  const createTraveler = useCreateTripTraveler(trip.id)
  const { toast } = useToast()

  // Handler for adding a relationship suggestion as a traveler
  const handleAddRelationship = async (suggestion: typeof relationshipSuggestions[number]) => {
    try {
      // Infer traveler type from relationship label
      const travelerType = inferTravelerTypeFromRelationship(suggestion.relationshipType)

      await createTraveler.mutateAsync({
        contactId: suggestion.contactId,
        role: 'full_access',
        travelerType,
        addToAllActivities: addToActivities,
      })

      // Add to added IDs (immutably)
      setAddedFamilyIds(new Set(addedFamilyIds).add(suggestion.contactId))

      toast({
        title: 'Traveler added',
        description: `${suggestion.name} has been added to the trip as a ${travelerType}`,
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add relationship',
        variant: 'destructive',
      })
    }
  }

  // Filter search results to exclude contacts already on the trip
  const searchResults = useMemo(() => {
    if (!contactsData?.data) return []
    return contactsData.data.filter((contact) => !existingContactIds.has(contact.id))
  }, [contactsData, existingContactIds])

  const showSearchResults = searchQuery.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Travelers</DialogTitle>
          <DialogDescription>
            Manage travelers for {trip.name}. Assign roles and add family members.
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search travelers by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Relationship Suggestions */}
        {primaryTravelerContactId && !showInlineForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-blue-900">
                {showAllRelationships ? 'Relationship Suggestions' : 'Family Suggestions'}
              </h4>
              <div className="flex items-center gap-2">
                <Label htmlFor="show-all-relationships" className="text-xs text-blue-700">
                  Show all relationships
                </Label>
                <Switch
                  id="show-all-relationships"
                  checked={showAllRelationships}
                  onCheckedChange={setShowAllRelationships}
                />
              </div>
            </div>
            <p className="text-xs text-blue-700 mb-3">
              {showAllRelationships
                ? 'Add any related contacts to this trip'
                : 'Add family members of the primary contact to this trip'}
            </p>
            {hasRelationships ? (
              <div className="flex flex-wrap gap-2">
                {relationshipSuggestions.map((suggestion) => {
                  const isAdded = addedFamilyIds.has(suggestion.contactId)
                  const isLoading = createTraveler.isPending
                  const categoryLabel = suggestion.category !== 'family'
                    ? getRelationshipCategoryLabel(suggestion.category)
                    : null

                  return (
                    <Button
                      key={suggestion.relationshipId}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddRelationship(suggestion)}
                      disabled={isAdded || isLoading}
                    >
                      {isAdded ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          {suggestion.name} ({suggestion.relationshipType})
                          {categoryLabel && (
                            <span className="ml-1 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              {categoryLabel}
                            </span>
                          )}
                        </>
                      )}
                    </Button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">
                No {showAllRelationships ? 'relationships' : 'family members'} found
              </p>
            )}
          </div>
        )}

        {/* Search Results */}
        {showSearchResults && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">
              Search Results
            </h4>

            {loadingContacts ? (
              <div className="py-8 text-center text-gray-500">
                Searching contacts...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No contacts found matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((contact) => (
                  <ContactSearchResult
                    key={contact.id}
                    contact={contact}
                    tripId={trip.id}
                    addToAllActivities={addToActivities}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Travelers List */}
        {!showSearchResults && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">
              Travelers ({travelers.length})
            </h4>

            {loadingTravelers ? (
              <div className="py-8 text-center text-gray-500">
                Loading travelers...
              </div>
            ) : travelers.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No travelers added yet
              </div>
            ) : (
              <div className="space-y-2">
                {travelers.map((traveler) => (
                  <TravelerRow
                    key={traveler.id}
                    traveler={traveler}
                    tripId={trip.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inline Contact Form */}
        {showInlineForm && (
          <InlineContactForm
            tripId={trip.id}
            onCancel={() => setShowInlineForm(false)}
            onSuccess={() => setShowInlineForm(false)}
            addToAllActivities={addToActivities}
          />
        )}

        {/* Add to Activities Checkbox */}
        <div className="flex items-center space-x-2 bg-gray-50 p-3 rounded-md">
          <Checkbox
            id="add-to-activities"
            checked={addToActivities}
            onCheckedChange={(checked) => setAddToActivities(checked === true)}
          />
          <Label
            htmlFor="add-to-activities"
            className="text-sm font-normal text-gray-700 cursor-pointer"
          >
            Add to all existing activities
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  When on, the traveler is also assigned to every existing activity
                  on this trip. You can still remove them from individual activities
                  afterwards. Turn off if this traveler only attends some activities.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInlineForm(!showInlineForm)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showInlineForm ? 'Cancel' : 'Create New Contact'}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
