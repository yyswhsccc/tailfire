'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ACTIVITY_TYPE_METADATA, type UIActivityType } from '@/lib/activity-constants'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'

interface ActivityTypeSelectorProps {
  children: React.ReactNode
  onSelect: (type: UIActivityType) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * Activity Type Selector Popover
 *
 * Displays a clickable list of activity types matching the
 * Trip Components sidebar styling (no drag handles).
 * Used by Add Activity buttons to select activity type before navigation.
 */
export function ActivityTypeSelector({
  children,
  onSelect,
  align = 'start',
  side = 'bottom',
}: ActivityTypeSelectorProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (type: UIActivityType) => {
    setOpen(false)
    onSelect(type)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align={align}
        side={side}
        sideOffset={4}
      >
        <div className="space-y-1">
          <p className="text-xs font-medium text-ash-500 px-2 pb-1">
            Select Activity Type
          </p>
          {Object.entries(ACTIVITY_TYPE_METADATA)
            .filter(([_, metadata]) => !metadata.hidden)
            .map(([type, metadata]) => (
              <button
                key={type}
                onClick={() => handleSelect(type as UIActivityType)}
                className={cn(
                  'flex items-center gap-2 w-full p-2 rounded-md',
                  'border border-ash-200',
                  'hover:bg-ash-50 hover:border-ash-300',
                  'focus:outline-none focus:ring-2 focus:ring-phoenix-gold-500 focus:ring-offset-1',
                  'transition-all text-left'
                )}
              >
                <ActivityIconBadge type={type} size="sm" shape="square" />
                <span className="text-sm font-medium text-ash-700">
                  {metadata.label}
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
