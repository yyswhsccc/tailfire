'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tag, BarChart3, Trash2, Plane, X, Loader2, Check } from 'lucide-react'
import { TagAssignPopover } from './tag-assign-popover'
import { useDeleteContact, useUpdateContactStatus } from '@/hooks/use-contacts'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkActionsToolbarProps {
  selectedIds: Set<string>
  onDeselect: () => void
  onCreateTrip: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'traveling', label: 'Traveling' },
  { value: 'returned', label: 'Returned' },
  { value: 'awaiting_next', label: 'Awaiting Next' },
  { value: 'inactive', label: 'Inactive' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionsToolbar({
  selectedIds,
  onDeselect,
  onCreateTrip,
}: BulkActionsToolbarProps) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [isDeletingContacts, setIsDeletingContacts] = useState(false)

  const { toast } = useToast()
  const updateStatus = useUpdateContactStatus()
  const deleteContact = useDeleteContact()

  const count = selectedIds.size

  // -------------------------------------------------------------------------
  // Status Change
  // -------------------------------------------------------------------------

  async function handleStatusChange(newStatus: string) {
    setIsChangingStatus(true)
    setStatusOpen(false)

    const ids = Array.from(selectedIds)
    let successCount = 0
    let errorCount = 0

    for (const id of ids) {
      try {
        await updateStatus.mutateAsync({ id, status: newStatus })
        successCount++
      } catch {
        errorCount++
      }
    }

    setIsChangingStatus(false)

    if (errorCount === 0) {
      toast({
        title: 'Status updated',
        description: `Updated ${successCount} contact${successCount === 1 ? '' : 's'} to "${STATUS_OPTIONS.find((o) => o.value === newStatus)?.label ?? newStatus}".`,
      })
    } else {
      toast({
        title: 'Status partially updated',
        description: `Succeeded for ${successCount}, failed for ${errorCount} contact${errorCount === 1 ? '' : 's'}.`,
        variant: 'destructive',
      })
    }

    onDeselect()
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async function handleDelete() {
    setIsDeletingContacts(true)

    const ids = Array.from(selectedIds)
    let successCount = 0
    let errorCount = 0

    for (const id of ids) {
      try {
        await deleteContact.mutateAsync(id)
        successCount++
      } catch {
        errorCount++
      }
    }

    setIsDeletingContacts(false)

    if (errorCount === 0) {
      toast({
        title: 'Contacts deleted',
        description: `Deleted ${successCount} contact${successCount === 1 ? '' : 's'}.`,
      })
    } else {
      toast({
        title: 'Delete partially completed',
        description: `Deleted ${successCount}, failed for ${errorCount} contact${errorCount === 1 ? '' : 's'}.`,
        variant: 'destructive',
      })
    }

    onDeselect()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-3">
      {/* Selection count */}
      <span className="text-sm font-medium text-blue-800 flex items-center gap-1.5 shrink-0">
        <Check className="h-3.5 w-3.5" />
        {count} selected
      </span>

      <div className="w-px h-5 bg-blue-200" />

      {/* Tag */}
      <TagAssignPopover
        selectedContactIds={Array.from(selectedIds)}
        onComplete={onDeselect}
      >
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Tag className="h-3.5 w-3.5 mr-1" />
          Tag
        </Button>
      </TagAssignPopover>

      {/* Status Change */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={isChangingStatus}
          >
            {isChangingStatus ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <BarChart3 className="h-3.5 w-3.5 mr-1" />
            )}
            Status ▾
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="start">
          <div className="flex flex-col gap-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            disabled={isDeletingContacts}
          >
            {isDeletingContacts ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1" />
            )}
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} contact{count === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {count === 1 ? 'this contact' : `these ${count} contacts`}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete {count === 1 ? 'Contact' : `${count} Contacts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Trip */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onCreateTrip}
      >
        <Plane className="h-3.5 w-3.5 mr-1" />
        Create Trip
      </Button>

      <div className="flex-1" />

      {/* Deselect All */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100"
        onClick={onDeselect}
      >
        <X className="h-3.5 w-3.5 mr-1" />
        Deselect All
      </Button>
    </div>
  )
}
