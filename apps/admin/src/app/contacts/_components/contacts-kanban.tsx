'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { useDndSensors } from '@/lib/dnd-config'
import { contactKeys } from '@/hooks/use-contacts'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ContactKanbanCard } from './contact-kanban-card'
import type { ContactListItemDto } from '@tailfire/shared-types/api'
import type { PaginatedContactsResponseDto } from '@tailfire/shared-types/api'

// ---------------------------------------------------------------------------
// Column configuration
// ---------------------------------------------------------------------------

const KANBAN_COLUMNS = [
  { id: 'prospecting', label: 'Prospecting', color: 'bg-blue-500' },
  { id: 'quoted', label: 'Quoted', color: 'bg-indigo-500' },
  { id: 'booked', label: 'Booked', color: 'bg-green-500' },
  { id: 'traveling', label: 'Traveling', color: 'bg-emerald-500' },
  { id: 'returned', label: 'Returned', color: 'bg-slate-500' },
  { id: 'awaiting_next', label: 'Awaiting Next', color: 'bg-amber-500' },
  { id: 'inactive', label: 'Inactive', color: 'bg-red-500' },
] as const

type ColumnId = (typeof KANBAN_COLUMNS)[number]['id']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContactsKanbanProps {
  contacts: ContactListItemDto[]
  isLoading: boolean
  onContactClick: (contactId: string) => void
}

// ---------------------------------------------------------------------------
// Droppable column wrapper
// ---------------------------------------------------------------------------

function KanbanColumn({
  id,
  label,
  color,
  count,
  isOver,
  children,
}: {
  id: string
  label: string
  color: string
  count: number
  isOver: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[260px] w-[260px] rounded-lg border bg-muted/40 transition-colors',
        isOver && 'ring-2 ring-blue-200 bg-blue-50/50',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', color)} />
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 h-5">
          {count}
        </Badge>
      </div>

      {/* Scrollable card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-280px)]">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draggable card wrapper
// ---------------------------------------------------------------------------

function DraggableCard({
  contact,
  onContactClick,
}: {
  contact: ContactListItemDto
  onContactClick: (contactId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { type: 'contact', contact },
  })

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <ContactKanbanCard
        contact={contact}
        onClick={() => onContactClick(contact.id)}
        isDragging={isDragging}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton cards for loading state
// ---------------------------------------------------------------------------

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border p-3 space-y-2 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactsKanban({
  contacts,
  isLoading,
  onContactClick,
}: ContactsKanbanProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const sensors = useDndSensors()

  // Active drag state
  const [activeContact, setActiveContact] =
    useState<ContactListItemDto | null>(null)

  // Track which column the drag is currently over
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  // Column visibility — persisted in localStorage
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('contacts-kanban-columns')
        return stored ? new Set(JSON.parse(stored)) : new Set()
      } catch {
        return new Set()
      }
    }
    return new Set()
  })

  // Group contacts by contactStatus
  const grouped = useMemo(() => {
    const map: Record<string, ContactListItemDto[]> = {}
    for (const col of KANBAN_COLUMNS) {
      map[col.id] = []
    }
    for (const contact of contacts) {
      const status = contact.contactStatus ?? 'prospecting'
      if (map[status]) {
        map[status].push(contact)
      }
    }
    return map
  }, [contacts])

  // Visible columns
  const visibleColumns = useMemo(
    () => KANBAN_COLUMNS.filter((col) => !hiddenColumns.has(col.id)),
    [hiddenColumns],
  )

  // Toggle column visibility
  const toggleColumn = useCallback(
    (columnId: string) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev)
        if (next.has(columnId)) {
          next.delete(columnId)
        } else {
          next.add(columnId)
        }
        localStorage.setItem(
          'contacts-kanban-columns',
          JSON.stringify([...next]),
        )
        return next
      })
    },
    [],
  )

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const contact = contacts.find((c) => c.id === event.active.id)
      if (contact) setActiveContact(contact)
    },
    [contacts],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      setOverColumnId(event.over?.id ? String(event.over.id) : null)
    },
    [],
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveContact(null)
      setOverColumnId(null)

      const { active, over } = event
      if (!over) return

      const contactId = String(active.id)
      const targetColumn = String(over.id) as ColumnId

      // Find the contact and its current status
      const contact = contacts.find((c) => c.id === contactId)
      if (!contact) return

      const sourceColumn = contact.contactStatus ?? 'prospecting'
      if (sourceColumn === targetColumn) return

      // Optimistic update — update all matching query caches
      queryClient.setQueriesData<PaginatedContactsResponseDto>(
        { queryKey: contactKeys.lists() },
        (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.map((c) =>
              c.id === contactId
                ? { ...c, contactStatus: targetColumn as ContactListItemDto['contactStatus'] }
                : c,
            ),
          }
        },
      )

      try {
        await api.patch(`/contacts/${contactId}/status`, {
          status: targetColumn,
        })
        // Invalidate to get fresh server state
        queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
        toast({
          title: 'Status updated',
          description: `Moved to ${KANBAN_COLUMNS.find((c) => c.id === targetColumn)?.label ?? targetColumn}.`,
        })
      } catch {
        // Revert optimistic update
        queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
        toast({
          title: 'Error',
          description: 'Failed to update contact status. Please try again.',
          variant: 'destructive',
        })
      }
    },
    [contacts, queryClient, toast],
  )

  const handleDragCancel = useCallback(() => {
    setActiveContact(null)
    setOverColumnId(null)
  }, [])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              Columns
              {hiddenColumns.size > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 h-5 text-[10px]">
                  {KANBAN_COLUMNS.length - hiddenColumns.size}/{KANBAN_COLUMNS.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium mb-2">Visible Columns</p>
              {KANBAN_COLUMNS.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 py-1 cursor-pointer"
                >
                  <Checkbox
                    checked={!hiddenColumns.has(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                  <span className={cn('h-2 w-2 rounded-full', col.color)} />
                  <span className="text-sm">{col.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              color={col.color}
              count={grouped[col.id]?.length ?? 0}
              isOver={overColumnId === col.id}
            >
              {isLoading ? (
                <ColumnSkeleton />
              ) : (
                grouped[col.id]?.map((contact) => (
                  <DraggableCard
                    key={contact.id}
                    contact={contact}
                    onContactClick={onContactClick}
                  />
                ))
              )}
              {!isLoading && (grouped[col.id]?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No contacts
                </p>
              )}
            </KanbanColumn>
          ))}
        </div>

        {/* Drag overlay — renders the card that follows the cursor */}
        <DragOverlay dropAnimation={null}>
          {activeContact ? (
            <div className="w-[244px]">
              <ContactKanbanCard
                contact={activeContact}
                onClick={() => {}}
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
