'use client'

import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateTripTraveler } from '@/hooks/use-trip-travelers'
import { useToast } from '@/hooks/use-toast'
import type { ContactResponseDto } from '@tailfire/shared-types/api'

interface ContactSearchResultProps {
  contact: ContactResponseDto
  tripId: string
  addToAllActivities?: boolean
}

/**
 * Contact search result row with "Add to Trip" functionality
 */
export function ContactSearchResult({ contact, tripId, addToAllActivities }: ContactSearchResultProps) {
  const [role, setRole] = useState<'primary_contact' | 'full_access' | 'limited_access'>('limited_access')
  const [travelerType, setTravelerType] = useState<'adult' | 'child' | 'infant'>('adult')
  const [isAdding, setIsAdding] = useState(false)
  const [isAdded, setIsAdded] = useState(false)

  const createTraveler = useCreateTripTraveler(tripId)
  const { toast } = useToast()

  const handleAddToTrip = async () => {
    setIsAdding(true)
    try {
      await createTraveler.mutateAsync({
        contactId: contact.id,
        role,
        travelerType,
        addToAllActivities,
      })

      setIsAdded(true)
      toast({
        title: 'Traveler added',
        description: `${getName()} has been added to the trip`,
      })

      // Reset state after 2 seconds
      setTimeout(() => {
        setIsAdding(false)
      }, 2000)
    } catch (error: any) {
      setIsAdding(false)
      toast({
        title: 'Error',
        description: error.message || 'Failed to add traveler',
        variant: 'destructive',
      })
    }
  }

  const getName = () => {
    const first = contact.firstName || ''
    const last = contact.lastName || ''
    const name = `${first} ${last}`.trim()
    return name || 'Unknown Contact'
  }

  const getInitials = () => {
    const name = getName()
    const parts = name.split(' ')
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && first && last) {
      return `${first[0]}${last[0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <div className="border border-gray-200 rounded-md p-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
            {getInitials()}
          </AvatarFallback>
        </Avatar>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{getName()}</p>
          {contact.email && (
            <p className="text-xs text-gray-500 truncate">{contact.email}</p>
          )}
        </div>

        {/* Role Select */}
        <Select value={role} onValueChange={(val: any) => setRole(val)} disabled={isAdded}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary_contact">Primary Contact</SelectItem>
            <SelectItem value="full_access">Full Access</SelectItem>
            <SelectItem value="limited_access">Limited Access</SelectItem>
          </SelectContent>
        </Select>

        {/* Traveler Type Select */}
        <Select value={travelerType} onValueChange={(val: any) => setTravelerType(val)} disabled={isAdded}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="adult">Adult</SelectItem>
            <SelectItem value="child">Child</SelectItem>
            <SelectItem value="infant">Infant</SelectItem>
          </SelectContent>
        </Select>

        {/* Add Button */}
        <Button
          size="sm"
          onClick={handleAddToTrip}
          disabled={isAdding || isAdded}
          className="h-8"
        >
          {isAdded ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Added
            </>
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
