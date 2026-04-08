'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useContacts } from '@/hooks/use-contacts'

interface ContactComboboxProps {
  /** Selected contact ID, or null for "New Contact" */
  value: string | null
  /** Display name for the initial matched contact */
  initialDisplayName?: string | null
  /** Callback when selection changes */
  onChange: (contactId: string | null) => void
  /** Passenger name to pre-fill search when no user input */
  passengerName?: string
  disabled?: boolean
  className?: string
}

export function ContactCombobox({
  value,
  initialDisplayName,
  onChange,
  passengerName,
  disabled = false,
  className,
}: ContactComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  // Debounce search input to reduce API calls
  const debouncedSetSearch = useDebouncedCallback((val: string) => {
    setDebouncedSearch(val)
  }, 300)

  // When the popover opens and there's no user input yet, seed search with
  // passengerName so the most relevant results appear immediately.
  const effectiveSearch = debouncedSearch || (open ? (passengerName ?? '') : '')

  const { data: contactsData, isLoading } = useContacts({
    search: effectiveSearch || undefined,
    limit: 10,
    scope: 'all',
  })

  const contacts = contactsData?.contacts ?? []

  // Resolve the display label for the trigger button
  const triggerLabel = React.useMemo(() => {
    if (value === null) return null // will render amber "+ New Contact"

    // Try to find the contact in the current results list first
    const found = contacts.find((c) => c.id === value)
    if (found) return found.displayName

    // Fall back to the initialDisplayName provided by the parent
    if (initialDisplayName) return initialDisplayName

    return value // last resort: show the raw UUID
  }, [value, contacts, initialDisplayName])

  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    debouncedSetSearch(val)
  }

  const handleSelectContact = (contactId: string) => {
    onChange(contactId)
    setOpen(false)
    setSearchInput('')
    setDebouncedSearch('')
  }

  const handleSelectNewContact = () => {
    onChange(null)
    setOpen(false)
    setSearchInput('')
    setDebouncedSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            className
          )}
          disabled={disabled}
        >
          {value === null ? (
            <span className="truncate text-amber-600">+ New Contact</span>
          ) : (
            <span className="truncate">{triggerLabel}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search contacts..."
            value={searchInput}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : contacts.length === 0 ? (
              <CommandEmpty>No contacts found.</CommandEmpty>
            ) : (
              <CommandGroup heading="Existing Contacts">
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={contact.id}
                    onSelect={() => handleSelectContact(contact.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === contact.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span>{contact.displayName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__create_new__"
                onSelect={handleSelectNewContact}
                className="cursor-pointer text-amber-600"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create New Contact</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
