'use client'

import { LayoutGrid, List } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type TripsViewMode = 'kanban' | 'table'

interface TripsViewSwitcherProps {
  view: TripsViewMode
  onViewChange: (view: TripsViewMode) => void
}

export function TripsViewSwitcher({ view, onViewChange }: TripsViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(value) => value && onViewChange(value as TripsViewMode)}
      className="gap-0"
    >
      <ToggleGroupItem
        value="kanban"
        aria-label="Kanban view"
        className={cn(
          'rounded-r-none border border-r-0',
          view === 'kanban' && 'bg-muted'
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        className={cn(
          'rounded-l-none border',
          view === 'table' && 'bg-muted'
        )}
      >
        <List className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
