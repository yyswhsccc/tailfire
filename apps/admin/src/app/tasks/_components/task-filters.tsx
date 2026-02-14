'use client'

import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { TaskFilterDto } from '@tailfire/shared-types/api'

interface TaskFiltersProps {
  filters: TaskFilterDto
  onFiltersChange: (filters: TaskFilterDto) => void
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const TASK_TYPE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'milestone', label: 'Milestone' },
]

export function TaskFilters({ filters, onFiltersChange }: TaskFiltersProps) {
  const activeFilterCount = [
    filters.status?.length,
    filters.priority?.length,
    filters.taskType?.length,
    filters.isOverdue,
  ].filter(Boolean).length

  const handleStatusChange = (value: string) => {
    if (value === 'all') {
      onFiltersChange({ ...filters, status: undefined, page: 1 })
    } else {
      onFiltersChange({ ...filters, status: [value] as TaskFilterDto['status'], page: 1 })
    }
  }

  const handlePriorityChange = (value: string) => {
    if (value === 'all') {
      onFiltersChange({ ...filters, priority: undefined, page: 1 })
    } else {
      onFiltersChange({ ...filters, priority: [value] as TaskFilterDto['priority'], page: 1 })
    }
  }

  const handleTaskTypeChange = (value: string) => {
    if (value === 'all') {
      onFiltersChange({ ...filters, taskType: undefined, page: 1 })
    } else {
      onFiltersChange({ ...filters, taskType: [value] as TaskFilterDto['taskType'], page: 1 })
    }
  }

  const handleOverdueToggle = () => {
    onFiltersChange({
      ...filters,
      isOverdue: filters.isOverdue ? undefined : true,
      page: 1,
    })
  }

  const clearFilters = () => {
    onFiltersChange({
      page: 1,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filters</h4>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={clearFilters}
                >
                  Clear all
                </Button>
              )}
            </div>

            <Separator />

            {/* Status filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.status?.[0] || 'all'}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={filters.priority?.[0] || 'all'}
                onValueChange={handlePriorityChange}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task type filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={filters.taskType?.[0] || 'all'}
                onValueChange={handleTaskTypeChange}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TASK_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Overdue toggle */}
            <Button
              variant={filters.isOverdue ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              onClick={handleOverdueToggle}
            >
              {filters.isOverdue ? 'Showing Overdue Only' : 'Show Overdue Only'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1">
          {filters.status && (
            <Badge variant="secondary" className="gap-1">
              {STATUS_OPTIONS.find((o) => o.value === filters.status?.[0])?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, status: undefined })}
              />
            </Badge>
          )}
          {filters.priority && (
            <Badge variant="secondary" className="gap-1">
              {PRIORITY_OPTIONS.find((o) => o.value === filters.priority?.[0])?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, priority: undefined })}
              />
            </Badge>
          )}
          {filters.isOverdue && (
            <Badge variant="secondary" className="gap-1">
              Overdue
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, isOverdue: undefined })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
