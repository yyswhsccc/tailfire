'use client'

import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { parseISODate } from '@/lib/date-utils'
import { ContactCombobox } from './contact-combobox'
import type { ImportPassenger, ImportContactMatch } from '@/types/import-booking.types'

interface PassengerListProps {
  passengers: ImportPassenger[]
  contactMatches?: ImportContactMatch[]
  /** paxno → contactId (null = create new) */
  contactOverrides: Record<number, string | null>
  onContactOverrideChange: (paxno: number, contactId: string | null) => void
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const parsed = parseISODate(dateStr)
  return parsed ? format(parsed, 'PP') : dateStr
}

function paxTypeLabel(paxtype: string) {
  switch (paxtype?.toLowerCase()) {
    case 'adult': return 'Adult'
    case 'child': return 'Child'
    case 'infant': return 'Infant'
    default: return paxtype || 'Unknown'
  }
}

export function PassengerList({
  passengers,
  contactMatches,
  contactOverrides,
  onContactOverrideChange,
}: PassengerListProps) {
  return (
    <div className="space-y-3">
      {passengers.map((pax) => {
        const match = contactMatches?.find((m) => m.paxno === pax.paxno)
        const currentValue = pax.paxno in contactOverrides
          ? (contactOverrides[pax.paxno] ?? null)
          : (match?.matchedContactId ?? null)

        return (
          <div
            key={pax.paxno}
            className="flex items-center justify-between gap-4 rounded-lg border border-ash-200 bg-white p-3"
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
            <div className="w-56 shrink-0">
              <ContactCombobox
                value={currentValue}
                initialDisplayName={match?.matchedContactName}
                onChange={(contactId) => onContactOverrideChange(pax.paxno, contactId)}
                passengerName={`${pax.firstname} ${pax.lastname}`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
