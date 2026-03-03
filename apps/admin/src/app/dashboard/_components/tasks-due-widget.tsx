'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2 } from 'lucide-react'
import { useCompleteTask } from '@/hooks/use-tasks'
import type { TaskDueSummary } from '@/hooks/use-dashboard'

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

interface TasksDueWidgetProps {
  tasks: TaskDueSummary[]
}

export function TasksDueWidget({ tasks }: TasksDueWidgetProps) {
  const completeTask = useCompleteTask()

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Tasks Due</CardTitle>
          <Link href="/tasks?sort=dueDate" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2" />
            <p className="text-sm">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  onCheckedChange={() => {
                    completeTask.mutate({ id: task.id })
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  {(task.linkedTripName || task.linkedContactName) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {task.linkedTripName || task.linkedContactName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[task.priority] || priorityColors.medium}`}>
                    {task.priority}
                  </span>
                  {task.isOverdue && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                      {task.daysOverdue}d overdue
                    </span>
                  )}
                  {task.dueDate && !task.isOverdue && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(task.dueDate), 'MMM d')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
