'use client'

import { useState } from 'react'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import { TripCard } from './trip-card'
import { cn } from '@/lib/utils'
import { useUpdateTrip } from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import {
  KANBAN_COLUMNS,
  getStatusForColumn,
  getTripStatusLabel,
  type TripStatus,
  type KanbanColumnId,
} from '@/lib/trip-status-constants'
import { canTransitionTripStatus, getValidTransitions } from '@tailfire/shared-types/api'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TripsKanbanProps {
  trips: TripResponseDto[]
}

interface SortableTripCardProps {
  trip: TripResponseDto
  isUpdating?: boolean
}

function SortableTripCard({ trip, isUpdating = false }: SortableTripCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: trip.id,
    disabled: isUpdating, // Disable drag while updating
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isUpdating ? 0.7 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isUpdating ? 'pointer-events-none' : ''}
      aria-label={`Trip: ${trip.name}`}
      aria-grabbed={isDragging}
      aria-disabled={isUpdating}
    >
      <TripCard trip={trip} isUpdating={isUpdating} />
    </div>
  )
}

interface DroppableColumnProps {
  column: typeof KANBAN_COLUMNS[number]
  trips: TripResponseDto[]
  pendingUpdates: Set<string>
}

function DroppableColumn({ column, trips, pendingUpdates }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div className="flex flex-col">
      {/* Column Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ash-900">
          {column.title}
        </h3>
      </div>

      {/* Column Content */}
      <SortableContext items={trips.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          role="group"
          aria-label={`${column.title} column, drop trips here to move them to ${column.title} status`}
          aria-dropeffect="move"
          className={cn(
            'flex-1 rounded-lg p-3 space-y-3 min-h-[400px] transition-colors',
            isOver ? 'bg-phoenix-gold-50 ring-2 ring-phoenix-gold-300' : 'bg-ash-100'
          )}
        >
          {trips.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-ash-400">
              No trips
            </div>
          ) : (
            trips.map((trip) => (
              <SortableTripCard
                key={trip.id}
                trip={trip}
                isUpdating={pendingUpdates.has(trip.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

/**
 * Trips Kanban
 * Kanban board view with drag-and-drop
 */
export function TripsKanban({ trips }: TripsKanbanProps) {
  const [activeTrip, setActiveTrip] = useState<TripResponseDto | null>(null)
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set())
  const { toast } = useToast()
  const updateTrip = useUpdateTrip()

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  )

  // Group trips by kanban column
  const groupedTrips = KANBAN_COLUMNS.reduce(
    (acc, column) => {
      acc[column.id] = trips.filter((trip) =>
        (column.statuses as readonly TripStatus[]).includes(trip.status as TripStatus)
      )
      return acc
    },
    {} as Record<string, TripResponseDto[]>
  )

  const handleDragStart = (event: DragStartEvent) => {
    const tripId = event.active.id.toString()

    // Prevent drag if trip is currently being updated
    if (pendingUpdates.has(tripId)) {
      return
    }

    const trip = trips.find((t) => t.id === tripId)
    setActiveTrip(trip || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTrip(null)

    if (!over) return

    // Get the column ID from the over container
    const overId = over.id.toString()

    // Check if we're dropping over a column
    const targetColumn = KANBAN_COLUMNS.find(col => col.id === overId)
    if (!targetColumn) {
      // We're dropping over a card, find which column it belongs to
      const targetTrip = trips.find(t => t.id === overId)
      if (!targetTrip) return

      // Find the column containing this trip
      const column = KANBAN_COLUMNS.find(col =>
        (col.statuses as readonly TripStatus[]).includes(targetTrip.status as TripStatus)
      )
      if (!column) return

      const newStatus = getStatusForColumn(column.id as KanbanColumnId)
      await updateTripStatus(active.id.toString(), newStatus)
    } else {
      const newStatus = getStatusForColumn(targetColumn.id)
      await updateTripStatus(active.id.toString(), newStatus)
    }
  }

  const updateTripStatus = async (tripId: string, newStatus: TripStatus) => {
    const trip = trips.find((t) => t.id === tripId)

    // Guard: Don't update if trip not found or status unchanged
    if (!trip || trip.status === newStatus) return

    // Validate status transition before attempting update
    const currentStatus = trip.status as TripStatus
    if (!canTransitionTripStatus(currentStatus, newStatus)) {
      const validTransitions = getValidTransitions(currentStatus)
      const validLabels = validTransitions.map(getTripStatusLabel).join(', ')

      toast({
        title: 'Invalid status change',
        description: validTransitions.length > 0
          ? `A ${getTripStatusLabel(currentStatus)} trip can only move to: ${validLabels}`
          : `A ${getTripStatusLabel(currentStatus)} trip cannot change status`,
        variant: 'destructive',
      })
      return
    }

    // Mark trip as pending update
    setPendingUpdates((prev) => new Set(prev).add(tripId))

    try {
      await updateTrip.mutateAsync({
        id: tripId,
        data: { status: newStatus },
      })

      toast({
        title: 'Trip updated',
        description: `Trip moved to ${getTripStatusLabel(newStatus)}`,
      })
    } catch (error: any) {
      toast({
        title: 'Cannot move trip',
        description: error?.message || 'Failed to update trip status. Please try again.',
        variant: 'destructive',
      })
    } finally {
      // Remove trip from pending updates
      setPendingUpdates((prev) => {
        const next = new Set(prev)
        next.delete(tripId)
        return next
      })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {KANBAN_COLUMNS.map((column) => {
          const columnTrips = groupedTrips[column.id] || []
          return (
            <DroppableColumn
              key={column.id}
              column={column}
              trips={columnTrips}
              pendingUpdates={pendingUpdates}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeTrip ? (
          <div className="opacity-80 rotate-2">
            <TripCard trip={activeTrip} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
