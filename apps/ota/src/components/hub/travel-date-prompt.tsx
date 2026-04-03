// apps/ota/src/components/hub/travel-date-prompt.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { useTravelSession } from '@/stores/travel-session-store'

interface TravelDatePromptProps {
  entityName: string
}

export function TravelDatePrompt({ entityName: _entityName }: TravelDatePromptProps) {
  const router = useRouter()
  const { departureDate, returnDate, dismissedDatePrompt, setDates, dismissPrompt } = useTravelSession()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  if ((departureDate && returnDate) || dismissedDatePrompt) return null

  const today = new Date().toISOString().split('T')[0]

  function handleSubmit() {
    if (startDate && endDate) {
      setDates(startDate, endDate)
      router.refresh() // Re-render server sections with new cookie
    }
  }

  return (
    <div className="mx-4 my-4 rounded-xl border border-[#C59746]/25 bg-[#faf6f0] p-4 sm:mx-10 lg:mx-[60px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center gap-2 text-[#C59746]">
          <Calendar className="size-5" />
          <p className="text-sm font-semibold">When are you traveling?</p>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 w-36 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
          />
          <span className="text-xs text-[#888]">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate || today}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 w-36 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!startDate || !endDate}
            className="h-9 shrink-0 rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] disabled:opacity-40"
          >
            Show options
          </button>
        </div>

        <button
          type="button"
          onClick={() => { dismissPrompt(); router.refresh() }}
          className="shrink-0 text-xs text-[#888] underline-offset-2 hover:underline"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
