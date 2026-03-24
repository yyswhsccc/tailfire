'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasks, taskKeys } from '@/hooks/use-tasks'
import { TaskFormDialog } from '@/app/tasks/_components/task-form-dialog'
import { TripTasksPhaseSection } from './trip-tasks-phase-section'
import type { TaskResponseDto, TripWithDetailsResponseDto } from '@tailfire/shared-types/api'

const PHASES = [
  { id: 'pre_booking', label: 'Pre-Booking' },
  { id: 'pre_departure', label: 'Pre-Departure' },
  { id: 'during_travel', label: 'During Travel' },
  { id: 'post_return', label: 'Post-Return' },
] as const

function inferPhase(
  taskPhase: string | null | undefined,
  dueDate: string | null | undefined,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): string {
  if (taskPhase) return taskPhase
  if (!dueDate) return 'post_return'
  const due = new Date(dueDate)
  if (tripStartDate && due < new Date(tripStartDate)) return 'pre_departure'
  if (
    tripStartDate &&
    tripEndDate &&
    due >= new Date(tripStartDate) &&
    due <= new Date(tripEndDate)
  )
    return 'during_travel'
  return 'post_return'
}

interface TripTasksProps {
  trip: TripWithDetailsResponseDto
}

export function TripTasks({ trip }: TripTasksProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskResponseDto | null>(null)
  const queryClient = useQueryClient()

  const { data: tasksResponse, isLoading } = useTasks({
    tripId: trip.id,
    limit: 100,
  })

  const tasks: TaskResponseDto[] = tasksResponse?.data || []

  // Group tasks by phase
  const grouped: Record<string, TaskResponseDto[]> = {
    pre_booking: [],
    pre_departure: [],
    during_travel: [],
    post_return: [],
  }

  for (const task of tasks) {
    const phase = inferPhase(task.phase, task.dueDate, trip.startDate, trip.endDate)
    const bucket = grouped[phase]
    if (bucket) {
      bucket.push(task)
    } else {
      grouped['post_return']!.push(task)
    }
  }

  const totalPending = tasks.filter((t) => t.status !== 'completed').length

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowCreateDialog(false)
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    } else {
      setShowCreateDialog(true)
    }
  }

  const handleEditDialogClose = (open: boolean) => {
    if (!open) {
      setEditingTask(null)
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Tasks</h2>
          {totalPending > 0 && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              {totalPending} pending
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Task
        </Button>
      </div>

      {/* Phase Sections */}
      {isLoading ? (
        <div className="text-sm text-zinc-500">Loading tasks...</div>
      ) : (
        PHASES.map((phase) => {
          const phaseTasks = grouped[phase.id] ?? []
          return (
            <TripTasksPhaseSection
              key={phase.id}
              phase={phase.id}
              label={phase.label}
              tasks={phaseTasks}
              defaultOpen={phaseTasks.length > 0}
              onEditTask={setEditingTask}
            />
          )
        })
      )}

      {/* Create Dialog */}
      <TaskFormDialog
        open={showCreateDialog}
        onOpenChange={handleDialogClose}
        tripId={trip.id}
      />

      {/* Edit Dialog */}
      {editingTask && (
        <TaskFormDialog
          open={!!editingTask}
          onOpenChange={handleEditDialogClose}
          task={editingTask}
          tripId={trip.id}
        />
      )}
    </div>
  )
}
