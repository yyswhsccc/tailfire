'use client'

import { Check, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { OcrContactMatch } from '@tailfire/shared-types'

interface OcrTravelerMatchesProps {
  matches: OcrContactMatch[]
}

export function OcrTravelerMatches({ matches }: OcrTravelerMatchesProps) {
  if (matches.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Travelers</h4>
      <div className="space-y-2">
        {matches.map((match) => (
          <div
            key={match.travelerIndex}
            className="flex items-center justify-between p-3 rounded-md border bg-white"
          >
            <div className="flex items-center gap-2">
              {match.isNewContact ? (
                <UserPlus className="h-4 w-4 text-amber-500" />
              ) : (
                <Check className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {match.firstName} {match.lastName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {match.isNewContact ? (
                <Badge variant="outline" className="text-xs">
                  New Contact
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Matched ({Math.round(match.confidence * 100)}%)
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
