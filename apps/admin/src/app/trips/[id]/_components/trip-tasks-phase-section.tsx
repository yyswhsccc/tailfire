'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TaskCard } from '@/app/tasks/_components/task-card'
import { useCompleteTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useToast } from '@/hooks/use-toast'
import type { TaskResponseDto } from '@tailfire/shared-types/api'

interface TripTasksPhaseSectionProps {
  phase: string
  label: string
  tasks: TaskResponseDto[]
  defaultOpen?: boolean
  onEditTask: (task: TaskResponseDto) => void
}

export function TripTasksPhaseSection({
  label,
  tasks,
  defaultOpen = false,
  onEditTask,
}: TripTasksPhaseSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const { toast } = useToast()
  const completeTask = useCompleteTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const pendingCount = tasks.filter((t) => t.status !== 'completed').length

  // Sort: pending tasks first (by dueDate ascending), completed tasks at bottom
  const sortedTasks = [...tasks].sort((a, b) => {
    const aCompleted = a.status === 'completed'
    const bCompleted = b.status === 'completed'
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1

    // Both same completion status: sort by dueDate ascending
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })

  const handleComplete = async (task: TaskResponseDto) => {
    try {
      if (task.status === 'completed') {
        await updateTask.mutateAsync({ id: task.id, data: { status: 'pending' } })
        toast({ title: 'Task reopened', description: task.title })
      } else {
        await completeTask.mutateAsync({ id: task.id })
        toast({ title: 'Task completed', description: task.title })
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (task: TaskResponseDto) => {
    try {
      await deleteTask.mutateAsync(task.id)
      toast({ title: 'Task deleted', description: task.title })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete task',
        variant: 'destructive',
      })
    }
  }

  const ChevronIcon = isOpen ? ChevronDown : ChevronRight

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
        <span className="font-semibold text-sm">{label}</span>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="ml-1 text-xs bg-amber-100 text-amber-800">
            {pendingCount}
          </Badge>
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {sortedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tasks</p>
          ) : (
            sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onEditTask(task)}
                onComplete={() => handleComplete(task)}
                onEdit={() => onEditTask(task)}
                onDelete={() => handleDelete(task)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
