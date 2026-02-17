'use client'

import { Trash2, Archive, ArchiveX, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TRIP_STATUS_LABELS } from '@/lib/trip-status-constants'
import type { TripStatus } from '@tailfire/shared-types'

interface TripsBulkActionsProps {
  selectedCount: number
  onDelete: () => void
  onArchive: () => void
  onUnarchive: () => void
  onChangeStatus: (status: TripStatus) => void
  onClearSelection: () => void
  isDeleting?: boolean
  isArchiving?: boolean
  isChangingStatus?: boolean
}

const TARGET_STATUSES: TripStatus[] = ['draft', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled']

export function TripsBulkActions({
  selectedCount,
  onDelete,
  onArchive,
  onUnarchive,
  onChangeStatus,
  onClearSelection,
  isDeleting,
  isArchiving,
  isChangingStatus,
}: TripsBulkActionsProps) {
  if (selectedCount === 0) return null

  const isProcessing = isDeleting || isArchiving || isChangingStatus

  return (
    <div className="flex items-center gap-2 bg-phoenix-gold-50 border border-phoenix-gold-200 rounded-lg px-4 py-2">
      <span className="text-sm font-medium text-phoenix-gold-700">
        {selectedCount} selected
      </span>

      <div className="h-4 w-px bg-phoenix-gold-200 mx-1" />

      {/* Change Status Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isProcessing}
            className="text-phoenix-gold-700 hover:text-phoenix-gold-800 hover:bg-phoenix-gold-100"
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Change Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TARGET_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => onChangeStatus(status)}
            >
              {TRIP_STATUS_LABELS[status] || status}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Archive/Unarchive */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isProcessing}
            className="text-phoenix-gold-700 hover:text-phoenix-gold-800 hover:bg-phoenix-gold-100"
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="mr-2 h-4 w-4" />
            Archive selected
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onUnarchive}>
            <ArchiveX className="mr-2 h-4 w-4" />
            Unarchive selected
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={isProcessing}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>

      <div className="h-4 w-px bg-phoenix-gold-200 mx-1" />

      {/* Clear Selection */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="text-phoenix-gold-600 hover:text-phoenix-gold-700"
      >
        Clear
      </Button>
    </div>
  )
}
