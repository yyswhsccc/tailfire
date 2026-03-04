'use client'

import { startOfWeek, addDays, format, isToday } from 'date-fns'

export function SidebarMiniCalendar() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        This Week
      </h4>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => (
          <div key={day.toISOString()} className="flex flex-col items-center">
            <span className="text-[10px] text-muted-foreground">{format(day, 'EEE')}</span>
            <span
              className={`text-xs font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                isToday(day)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
