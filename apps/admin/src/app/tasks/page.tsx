'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { TernDashboardLayout } from '@/components/tern/layout'
import { PageHeader } from '@/components/tern/shared'
import { TernButton } from '@/components/tern/core'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/tern/shared'
import { TableSkeleton } from '@/components/tern/shared/loading-skeleton'
import { useTasks } from '@/hooks/use-tasks'
import { TaskList, TaskFormDialog, TaskFilters } from './_components'
import type { TaskFilterDto, TaskResponseDto } from '@tailfire/shared-types/api'

/**
 * Tasks Page
 *
 * Full task management interface with:
 * - Task list with filtering and search
 * - Create/Edit task modal
 * - Quick status updates (complete/uncomplete)
 * - Filter by status, priority, type, overdue
 */
export default function TasksPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskResponseDto | null>(null)
  const [searchInput, setSearchInput] = useState('')

  // Filter state
  const [filters, setFilters] = useState<TaskFilterDto>({
    page: 1,
    limit: 25,
    sortBy: 'dueDate',
    sortOrder: 'asc',
  })

  // Fetch tasks with filters
  const { data, isLoading, error, refetch } = useTasks(filters)

  // Handle search submit
  const handleSearchSubmit = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      search: searchInput || undefined,
      page: 1,
    }))
  }, [searchInput])

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: TaskFilterDto) => {
    setFilters(newFilters)
  }, [])

  // Handle task click (open edit modal)
  const handleTaskClick = useCallback((task: TaskResponseDto) => {
    setSelectedTask(task)
    setIsCreateOpen(true)
  }, [])

  // Handle modal close
  const handleDialogClose = useCallback((open: boolean) => {
    setIsCreateOpen(open)
    if (!open) {
      setSelectedTask(null)
    }
  }, [])

  // Memoize tasks to prevent unnecessary re-renders
  const tasks = useMemo(() => data?.data || [], [data?.data])

  // Check if we have active filters
  const hasActiveFilters =
    filters.status ||
    filters.priority ||
    filters.taskType ||
    filters.search ||
    filters.isOverdue

  return (
    <TernDashboardLayout>
      {/* Page Header */}
      <PageHeader
        title="Tasks"
        description="Manage your tasks and to-dos"
        actions={
          <div className="flex items-center gap-2">
            {/* Filter Panel */}
            <TaskFilters filters={filters} onFiltersChange={handleFiltersChange} />

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search tasks..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                onBlur={handleSearchSubmit}
                className="w-64 pl-9"
              />
            </div>

            <TernButton onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </TernButton>
          </div>
        }
      />

      {/* Content */}
      <div className="mt-6">
        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">
              Failed to load tasks. Please try again.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={5} />
        ) : tasks.length === 0 && !hasActiveFilters ? (
          <EmptyState
            title="No tasks yet"
            description="Get started by creating your first task"
            action={{
              label: 'Create Task',
              onClick: () => setIsCreateOpen(true),
            }}
          />
        ) : tasks.length === 0 && hasActiveFilters ? (
          <EmptyState
            title="No matching tasks"
            description="Try adjusting your filters or search query"
            action={{
              label: 'Clear Filters',
              onClick: () => {
                setFilters({ page: 1, limit: 25, sortBy: 'dueDate', sortOrder: 'asc' })
                setSearchInput('')
              },
            }}
          />
        ) : (
          <TaskList
            tasks={tasks}
            isLoading={isLoading}
            onTaskClick={handleTaskClick}
            onCreateTask={() => setIsCreateOpen(true)}
          />
        )}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total} tasks
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Task Dialog */}
      <TaskFormDialog
        open={isCreateOpen}
        onOpenChange={handleDialogClose}
        task={selectedTask}
      />
    </TernDashboardLayout>
  )
}
