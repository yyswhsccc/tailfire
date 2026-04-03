'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { useTravelSession } from '@/stores/travel-session-store'

interface SectionDatePromptProps {
  icon: string
  heading: string
  subtitle: string
  buttonLabel: string
  searchHref: string
  searchLabel: string
}

export function SectionDatePrompt({
  icon,
  heading,
  subtitle,
  buttonLabel,
  searchHref,
  searchLabel,
}: SectionDatePromptProps) {
  const { setDates } = useTravelSession()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const today = new Date().toISOString().split('T')[0]

  function handleSubmit() {
    if (startDate && endDate) {
      setDates(startDate, endDate)
      // No router.refresh() needed — ClientFlightResults/ClientHotelResults
      // react to Zustand store changes directly via useEffect
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#C59746]/20 bg-gradient-to-br from-[#faf6f0] to-white shadow-sm">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-sm font-bold text-[#1A1A1A]">{heading}</p>
            <p className="mt-0.5 text-xs text-[#888]">{subtitle}</p>
          </div>
        </div>

        {/* Date pickers */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-4 text-[#C59746]" />
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 w-40 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            />
          </div>
          <span className="text-sm text-[#888]">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate || today}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 w-40 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!startDate || !endDate}
            className="h-10 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] disabled:opacity-40"
          >
            {buttonLabel}
          </button>
        </div>

        {/* Fallback link */}
        <div className="mt-3">
          <a href={searchHref} className="text-xs text-[#C59746] hover:underline">
            {searchLabel}
          </a>
        </div>
      </div>
    </div>
  )
}
