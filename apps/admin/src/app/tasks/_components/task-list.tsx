'use client'

import { useCallback } from 'react'
import { TaskCard } from './task-card'
import { EmptyState } from '@/components/tern/shared'
import { TableSkeleton } from '@/components/tern/shared/loading-skeleton'
import { useCompleteTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useToast } from '@/hooks/use-toast'
import type { TaskResponseDto } from '@tailfire/shared-types/api'

interface TaskListProps {
  tasks: TaskResponseDto[]
  isLoading?: boolean
  onTaskClick?: (task: TaskResponseDto) => void
  onCreateTask?: () => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

export function TaskList({
  tasks,
  isLoading,
  onTaskClick,
  onCreateTask,
  selectedIds = new Set(),
  onSelectionChange,
}: TaskListProps) {
  const { toast } = useToast()
  const completeTask = useCompleteTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const handleComplete = useCallback(
    async (task: TaskResponseDto) => {
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
    },
    [completeTask, updateTask, toast]
  )

  const handleDelete = useCallback(
    async (task: TaskResponseDto) => {
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
    },
    [deleteTask, toast]
  )

  const handleSelect = useCallback(
    (taskId: string, selected: boolean) => {
      if (!onSelectionChange) return
      const newSelected = new Set(selectedIds)
      if (selected) {
        newSelected.add(taskId)
      } else {
        newSelected.delete(taskId)
      }
      onSelectionChange(newSelected)
    },
    [selectedIds, onSelectionChange]
  )

  if (isLoading) {
    return <TableSkeleton rows={5} />
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        description="Create your first task to get started"
        action={
          onCreateTask
            ? {
                label: 'Create Task',
                onClick: onCreateTask,
              }
            : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          selected={selectedIds.has(task.id)}
          onSelect={
            onSelectionChange
              ? (selected) => handleSelect(task.id, selected)
              : undefined
          }
          onClick={() => onTaskClick?.(task)}
          onComplete={() => handleComplete(task)}
          onEdit={() => onTaskClick?.(task)}
          onDelete={() => handleDelete(task)}
        />
      ))}
    </div>
  )
}
