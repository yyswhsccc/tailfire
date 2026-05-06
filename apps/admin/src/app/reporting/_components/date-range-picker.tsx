'use client'

import { useMemo } from 'react'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DatePreset } from '@tailfire/shared-types/api'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  preset: DatePreset
  onChange: (startDate: string, endDate: string, preset: DatePreset) => void
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'full-year', label: 'Full Year' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
]

function computeDateRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date()
  // Use Eastern Time for date boundaries (consistent with dashboard)
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const year = Number(etParts.find(p => p.type === 'year')!.value)
  const month = Number(etParts.find(p => p.type === 'month')!.value) - 1 // 0-indexed

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'mtd':
      return {
        startDate: fmt(new Date(year, month, 1)),
        endDate: fmt(now),
      }
    case 'ytd':
      return {
        startDate: fmt(new Date(year, 0, 1)),
        endDate: fmt(now),
      }
    case 'last-month': {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 0) // last day of previous month
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    case 'last-quarter': {
      const currentQ = Math.floor(month / 3)
      const prevQ = currentQ === 0 ? 3 : currentQ - 1
      const qYear = currentQ === 0 ? year - 1 : year
      return {
        startDate: fmt(new Date(qYear, prevQ * 3, 1)),
        endDate: fmt(new Date(qYear, prevQ * 3 + 3, 0)),
      }
    }
    case 'q1':
      return {
        startDate: fmt(new Date(year, 0, 1)),
        endDate: fmt(new Date(year, 3, 0)),
      }
    case 'q2':
      return {
        startDate: fmt(new Date(year, 3, 1)),
        endDate: fmt(new Date(year, 6, 0)),
      }
    case 'q3':
      return {
        startDate: fmt(new Date(year, 6, 1)),
        endDate: fmt(new Date(year, 9, 0)),
      }
    case 'q4':
      return {
        startDate: fmt(new Date(year, 9, 1)),
        endDate: fmt(new Date(year, 12, 0)),
      }
    case 'full-year':
      return {
        startDate: fmt(new Date(year, 0, 1)),
        endDate: fmt(new Date(year, 11, 31)),
      }
    case 'last-year':
      return {
        startDate: fmt(new Date(year - 1, 0, 1)),
        endDate: fmt(new Date(year - 1, 12, 0)),
      }
    case 'custom':
      // Keep current dates
      return { startDate: '', endDate: '' }
  }
}

export function DateRangePicker({
  startDate,
  endDate,
  preset,
  onChange,
}: DateRangePickerProps) {
  const startDateObj = useMemo(
    () => (startDate ? new Date(startDate + 'T00:00:00') : undefined),
    [startDate],
  )
  const endDateObj = useMemo(
    () => (endDate ? new Date(endDate + 'T00:00:00') : undefined),
    [endDate],
  )

  function handlePresetClick(p: DatePreset) {
    if (p === 'custom') {
      onChange(startDate, endDate, 'custom')
      return
    }
    const range = computeDateRange(p)
    onChange(range.startDate, range.endDate, p)
  }

  function handleStartDateSelect(date: Date | undefined) {
    if (!date) return
    const formatted = date.toISOString().slice(0, 10)
    onChange(formatted, endDate, 'custom')
  }

  function handleEndDateSelect(date: Date | undefined) {
    if (!date) return
    const formatted = date.toISOString().slice(0, 10)
    onChange(startDate, formatted, 'custom')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            variant={preset === p.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom date inputs */}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[130px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {startDate ? format(startDateObj!, 'MMM d, yyyy') : 'Start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDateObj}
                onSelect={handleStartDateSelect}
              />
            </PopoverContent>
          </Popover>
          <span className="text-sm text-muted-foreground">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[130px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {endDate ? format(endDateObj!, 'MMM d, yyyy') : 'End date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDateObj}
                onSelect={handleEndDateSelect}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}
