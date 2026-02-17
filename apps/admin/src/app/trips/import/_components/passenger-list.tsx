'use client'

import { format } from 'date-fns'
import { UserCheck, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { parseISODate } from '@/lib/date-utils'
import type { ImportPassenger } from '@/types/import-booking.types'

interface PassengerListProps {
  passengers: ImportPassenger[]
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const parsed = parseISODate(dateStr)
  return parsed ? format(parsed, 'PP') : dateStr
}

function paxTypeLabel(paxtype: string) {
  switch (paxtype?.toLowerCase()) {
    case 'adult':
      return 'Adult'
    case 'child':
      return 'Child'
    case 'infant':
      return 'Infant'
    default:
      return paxtype || 'Unknown'
  }
}

export function PassengerList({ passengers }: PassengerListProps) {
  return (
    <div className="space-y-3">
      {passengers.map((pax) => (
        <div
          key={pax.paxno}
          className="flex items-start justify-between rounded-lg border border-ash-200 bg-white p-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ash-900">
                {pax.paxno}. {pax.title} {pax.firstname} {pax.lastname}
              </span>
              <Badge variant="outline" className="text-xs">
                {paxTypeLabel(pax.paxtype)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ash-500">
              {pax.dob && <span>DOB: {formatDate(pax.dob)}</span>}
              {pax.age > 0 && <span>Age: {pax.age}</span>}
              {pax.gender && <span>{pax.gender}</span>}
              {pax.nationality && <span>{pax.nationality}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ash-500">
            {pax.dob ? (
              <>
                <UserCheck className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-700">Will match or create contact</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-blue-700">Will match or create contact</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
