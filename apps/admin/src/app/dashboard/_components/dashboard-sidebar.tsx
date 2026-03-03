'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarQuickCreate } from './sidebar-quick-create'
import { SidebarMiniCalendar } from './sidebar-mini-calendar'
import { SidebarTodayTasks } from './sidebar-today-tasks'
import { SidebarAgentLeaderboard } from './sidebar-agent-leaderboard'
import type { TaskDueSummary, AgentLeaderboardEntry } from '@/hooks/use-dashboard'

interface DashboardSidebarProps {
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  tasks: TaskDueSummary[]
  leaderboard: AgentLeaderboardEntry[] | null
}

export function DashboardSidebar({ isOpen, onToggle, isAdmin, tasks, leaderboard }: DashboardSidebarProps) {
  if (!isOpen) return null

  return (
    <aside className="w-[280px] shrink-0 border-l pl-4 space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dashboard</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggle}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <SidebarQuickCreate />
      <SidebarMiniCalendar />
      <SidebarTodayTasks tasks={tasks} />
      {isAdmin && leaderboard && leaderboard.length > 0 && (
        <SidebarAgentLeaderboard agents={leaderboard} />
      )}
    </aside>
  )
}
