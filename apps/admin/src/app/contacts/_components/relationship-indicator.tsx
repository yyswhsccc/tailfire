'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRelationships } from '@/hooks/use-relationships'

interface RelationshipIndicatorProps {
  contactId: string
  contactName: string
  count: number
  onClick?: () => void
}

export function RelationshipIndicator({
  contactId,
  contactName,
  count,
  onClick,
}: RelationshipIndicatorProps) {
  const [hovered, setHovered] = useState(false)

  // Lazy-load relationship details only on hover
  // useRelationships takes (contactId | null) — enabled: !!contactId disables when null
  const { data: relationships } = useRelationships(
    hovered && count > 0 ? contactId : null
  )

  if (count === 0) return null

  const tooltipLines = relationships
    ? relationships.map((r) => {
        // API always puts the "other" contact in relatedContact, regardless of which
        // side of the relationship the querying contact is on. The label to show is
        // from the querying contact's perspective.
        const isContact1 = r.contactId1 === contactId
        const label = isContact1 ? r.labelForContact1 : r.labelForContact2
        const otherName = r.relatedContact?.displayName ?? 'Unknown'
        return `${label || 'Related to'} ${otherName}`
      })
    : ['Loading...']

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-ash-500 hover:text-ash-900 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onClick?.()
            }}
            onMouseEnter={() => setHovered(true)}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{count}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-xs font-medium mb-1">{contactName}&apos;s Relationships</p>
          {tooltipLines.map((line, i) => (
            <p key={i} className="text-xs text-muted-foreground">{line}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
