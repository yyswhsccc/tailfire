'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plane, Users } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { useSearch } from '@/hooks/use-search'
import { formatDate } from '@/lib/utils'
import { getTripStatusVariant } from '@/lib/trip-status-constants'
import type { TripSearchResult, ContactSearchResult } from '@tailfire/shared-types/api'

interface SuperSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SuperSearchDialog({ open, onOpenChange }: SuperSearchDialogProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { data, isLoading } = useSearch(query)

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const handleSelect = useCallback(
    (url: string) => {
      router.push(url)
      onOpenChange(false)
    },
    [router, onOpenChange],
  )

  // Gate result rendering on query length — prevents stale cached results
  const isSearchActive = query.length >= 2
  const trips = isSearchActive ? data?.trips : undefined
  const contacts = isSearchActive ? data?.contacts : undefined
  const hasResults = (trips?.items.length ?? 0) > 0 || (contacts?.items.length ?? 0) > 0
  const showEmpty = isSearchActive && !isLoading && !hasResults

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-lg" aria-describedby={undefined}>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search trips, contacts..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            {isLoading && isSearchActive && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            )}

            {showEmpty && <CommandEmpty>No results found.</CommandEmpty>}

            {/* Trips group */}
            {trips && trips.items.length > 0 && (
              <CommandGroup heading="Trips">
                {trips.items.map((trip: TripSearchResult) => (
                  <CommandItem
                    key={trip.id}
                    value={`trip-${trip.id}`}
                    onSelect={() => handleSelect(trip.url)}
                    className="cursor-pointer"
                  >
                    <Plane className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{trip.title}</span>
                        {trip.status && (
                          <Badge variant={getTripStatusVariant(trip.status)} className="shrink-0 text-xs">
                            {trip.status.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {trip.referenceNumber && (
                          <span className="text-xs text-muted-foreground">{trip.referenceNumber}</span>
                        )}
                        {trip.startDate && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(trip.startDate)}
                            {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {trips.hasMore && (
                  <CommandItem
                    value="view-all-trips"
                    onSelect={() => handleSelect('/trips')}
                    className="cursor-pointer justify-center text-muted-foreground"
                  >
                    <span className="text-xs">View all trip results</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {trips && trips.items.length > 0 && contacts && contacts.items.length > 0 && (
              <CommandSeparator />
            )}

            {/* Contacts group */}
            {contacts && contacts.items.length > 0 && (
              <CommandGroup heading="Contacts">
                {contacts.items.map((contact: ContactSearchResult) => (
                  <CommandItem
                    key={contact.id}
                    value={`contact-${contact.id}`}
                    onSelect={() => handleSelect(contact.url)}
                    className="cursor-pointer"
                  >
                    <Users className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{contact.title}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {contact.email && (
                          <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                        )}
                        {contact.phone && (
                          <span className="text-xs text-muted-foreground">{contact.phone}</span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {contacts.hasMore && (
                  <CommandItem
                    value="view-all-contacts"
                    onSelect={() => handleSelect('/contacts')}
                    className="cursor-pointer justify-center text-muted-foreground"
                  >
                    <span className="text-xs">View all contact results</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
