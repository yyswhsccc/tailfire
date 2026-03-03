'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2 } from 'lucide-react'
import { useCompleteTask } from '@/hooks/use-tasks'
import type { TaskDueSummary } from '@/hooks/use-dashboard'

interface SidebarTodayTasksProps {
  tasks: TaskDueSummary[]
}

export function SidebarTodayTasks({ tasks }: SidebarTodayTasksProps) {
  const completeTask = useCompleteTask()

  const todayStr = new Date().toISOString().split('T')[0]
  const todayTasks = tasks.filter((t) => t.dueDate === todayStr)

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Today&apos;s Tasks
      </h4>
      {todayTasks.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <CheckCircle2 className="h-4 w-4" />
          All clear!
        </div>
      ) : (
        <div className="space-y-2">
          {todayTasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2">
              <Checkbox
                className="mt-0.5"
                onCheckedChange={() => completeTask.mutate(task.id)}
              />
              <span className="text-xs">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
