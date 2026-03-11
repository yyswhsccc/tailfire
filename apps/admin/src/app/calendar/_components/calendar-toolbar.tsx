'use client'

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { useCalendarStore } from '@/stores/calendar.store'
import type { CalendarView, CalendarEventType } from '@tailfire/shared-types/api'

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'list', label: 'List' },
]

const EVENT_TYPE_OPTIONS: { value: CalendarEventType; label: string; color: string }[] = [
  { value: 'task', label: 'Tasks', color: 'bg-blue-500' },
  { value: 'payment_deposit', label: 'Deposits', color: 'bg-amber-500' },
  { value: 'payment_final', label: 'Final Payments', color: 'bg-red-500' },
  { value: 'birthday', label: 'Birthdays', color: 'bg-pink-500' },
  { value: 'trip', label: 'Trips', color: 'bg-emerald-500' },
  { value: 'activity', label: 'Activities', color: 'bg-indigo-500' },
  { value: 'event', label: 'Events', color: 'bg-violet-500' },
  { value: 'scheduled_email', label: 'Emails', color: 'bg-slate-500' },
]

interface CalendarToolbarProps {
  userOptions?: { id: string; name: string }[]
  isAdmin?: boolean
}

export function CalendarToolbar({ userOptions = [], isAdmin = false }: CalendarToolbarProps) {
  const {
    currentView,
    currentDate,
    selectedUserId,
    enabledEventTypes,
    setView,
    setDate,
    setSelectedUser,
    toggleEventType,
  } = useCalendarStore()

  const currentDateObj = new Date(currentDate)

  const navigatePrevious = () => {
    switch (currentView) {
      case 'month':
        setDate(subMonths(currentDateObj, 1).toISOString())
        break
      case 'week':
        setDate(subWeeks(currentDateObj, 1).toISOString())
        break
      case 'day':
      case 'list':
        setDate(subDays(currentDateObj, 1).toISOString())
        break
    }
  }

  const navigateNext = () => {
    switch (currentView) {
      case 'month':
        setDate(addMonths(currentDateObj, 1).toISOString())
        break
      case 'week':
        setDate(addWeeks(currentDateObj, 1).toISOString())
        break
      case 'day':
      case 'list':
        setDate(addDays(currentDateObj, 1).toISOString())
        break
    }
  }

  const goToToday = () => {
    setDate(new Date().toISOString())
  }

  const getDateLabel = () => {
    switch (currentView) {
      case 'month':
        return format(currentDateObj, 'MMMM yyyy')
      case 'week':
        return `Week of ${format(currentDateObj, 'MMM d, yyyy')}`
      case 'day':
        return format(currentDateObj, 'EEEE, MMMM d, yyyy')
      case 'list':
        return format(currentDateObj, 'MMMM yyyy')
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4 border-b">
      {/* Top row: Navigation and View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 font-semibold text-lg">
                <CalendarIcon className="h-4 w-4" />
                {getDateLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDateObj}
                onSelect={(date) => date && setDate(date.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-4">
          {/* User filter (Admin only) */}
          {isAdmin && userOptions.length > 0 && (
            <Select value={selectedUserId || 'all'} onValueChange={(v) => setSelectedUser(v === 'all' ? null : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {userOptions.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View toggle */}
          <ToggleGroup type="single" value={currentView} onValueChange={(v) => v && setView(v as CalendarView)}>
            {VIEW_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Bottom row: Event type filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground mr-2">Show:</span>
        {EVENT_TYPE_OPTIONS.map((option) => {
          const isEnabled = enabledEventTypes.includes(option.value)
          return (
            <Badge
              key={option.value}
              variant={isEnabled ? 'default' : 'outline'}
              className={`cursor-pointer transition-colors ${
                isEnabled ? option.color + ' text-white border-transparent' : 'hover:bg-muted'
              }`}
              onClick={() => toggleEventType(option.value)}
            >
              {option.label}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
