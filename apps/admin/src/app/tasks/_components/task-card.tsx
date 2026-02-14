'use client'

import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  CheckCircle2,
  Circle,
  Clock,
  MoreVertical,
  User,
  Plane,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskResponseDto } from '@tailfire/shared-types/api'

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
}

const STATUS_COLORS = {
  pending: 'text-gray-500',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  cancelled: 'text-gray-400',
}

interface TaskCardProps {
  task: TaskResponseDto
  selected?: boolean
  onSelect?: (selected: boolean) => void
  onClick?: () => void
  onComplete?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function TaskCard({
  task,
  selected,
  onSelect,
  onClick,
  onComplete,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'completed'
  const isDueToday = task.dueDate && isToday(parseISO(task.dueDate))
  const isCompleted = task.status === 'completed'

  const StatusIcon = isCompleted ? CheckCircle2 : Circle

  return (
    <div
      className={cn(
        'group relative bg-white border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer',
        selected && 'ring-2 ring-primary',
        isOverdue && 'border-red-200 bg-red-50/50',
        isCompleted && 'opacity-60'
      )}
      onClick={onClick}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div
          className="absolute left-3 top-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
      )}

      <div className={cn('flex items-start gap-3', onSelect && 'pl-8')}>
        {/* Status indicator */}
        <button
          className={cn(
            'flex-shrink-0 mt-0.5 hover:scale-110 transition-transform',
            STATUS_COLORS[task.status]
          )}
          onClick={(e) => {
            e.stopPropagation()
            onComplete?.()
          }}
        >
          <StatusIcon className="h-5 w-5" />
        </button>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                'font-medium text-sm',
                isCompleted && 'line-through text-muted-foreground'
              )}
            >
              {task.title}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={onComplete}>
                  {isCompleted ? 'Mark Incomplete' : 'Mark Complete'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Priority badge */}
            <Badge variant="secondary" className={cn('text-xs', PRIORITY_COLORS[task.priority])}>
              {task.priority}
            </Badge>

            {/* Due date */}
            {task.dueDate && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs',
                  isOverdue && 'text-red-600',
                  isDueToday && !isOverdue && 'text-orange-600',
                  !isOverdue && !isDueToday && 'text-muted-foreground'
                )}
              >
                {isOverdue ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {isOverdue
                  ? 'Overdue'
                  : isDueToday
                    ? 'Due today'
                    : format(parseISO(task.dueDate), 'MMM d')}
              </div>
            )}

            {/* Assignee */}
            {(task.assignee?.name || task.assigneeName) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {task.assignee?.name || task.assigneeName}
              </div>
            )}

            {/* Trip link */}
            {task.trip?.name && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Plane className="h-3 w-3" />
                {task.trip.name}
              </div>
            )}
          </div>

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="text-xs"
                  style={{ borderColor: tag.color, color: tag.color }}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
