'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Plane } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { RelationshipIndicator } from './relationship-indicator'
import type { ContactListItemDto } from '@tailfire/shared-types/api'

interface ContactKanbanCardProps {
  contact: ContactListItemDto
  onClick: () => void
  isDragging?: boolean
}

function getInitials(contact: ContactListItemDto): string {
  const first = contact.firstName?.[0] ?? ''
  const last = contact.lastName?.[0] ?? ''
  return (first + last).toUpperCase() || '?'
}

export function ContactKanbanCard({
  contact,
  onClick,
  isDragging,
}: ContactKanbanCardProps) {
  const tags = contact.tags ?? []
  const visibleTags = tags.slice(0, 2)
  const extraTagCount = tags.length - visibleTags.length

  const nextTripDate =
    contact.nextTripDate ? new Date(contact.nextTripDate) : null
  const hasNextTrip = !!contact.nextTripName && !!nextTripDate

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow space-y-1.5',
        isDragging && 'opacity-50 ring-2 ring-blue-400'
      )}
    >
      {/* Top row: avatar + name + relationship indicator */}
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-[10px] font-semibold">
            {getInitials(contact)}
          </AvatarFallback>
        </Avatar>

        <span className="text-sm font-semibold leading-none flex-1 truncate">
          {contact.displayName}
        </span>

        {(contact.relationshipCount ?? 0) > 0 && (
          <RelationshipIndicator
            contactId={contact.id}
            contactName={contact.displayName}
            count={contact.relationshipCount ?? 0}
          />
        )}
      </div>

      {/* Email */}
      {contact.email && (
        <p className="text-xs text-muted-foreground truncate">
          {contact.email}
        </p>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {visibleTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4"
            >
              {tag}
            </Badge>
          ))}
          {extraTagCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              +{extraTagCount}
            </span>
          )}
        </div>
      )}

      {/* Next trip */}
      {hasNextTrip && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Plane className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {contact.nextTripName} &mdash;{' '}
            {format(nextTripDate!, 'MMM d')}
          </span>
        </div>
      )}
    </div>
  )
}
