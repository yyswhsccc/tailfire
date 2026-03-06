'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

function SidebarContent({ isAdmin, tasks, leaderboard }: Pick<DashboardSidebarProps, 'isAdmin' | 'tasks' | 'leaderboard'>) {
  return (
    <div className="space-y-6">
      <SidebarQuickCreate />
      <SidebarMiniCalendar />
      <SidebarTodayTasks tasks={tasks} />
      {isAdmin && leaderboard && leaderboard.length > 0 && (
        <SidebarAgentLeaderboard agents={leaderboard} />
      )}
    </div>
  )
}

export function DashboardSidebar({ isOpen, onToggle, isAdmin, tasks, leaderboard }: DashboardSidebarProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279px)')
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  if (!isOpen) return null

  // Mobile / tablet: render as Sheet overlay
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onToggle}>
        <SheetContent side="right" className="w-[300px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dashboard
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <SidebarContent isAdmin={isAdmin} tasks={tasks} leaderboard={leaderboard} />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: inline sidebar
  return (
    <aside className="w-[280px] shrink-0 border-l pl-4 space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dashboard</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggle}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <SidebarContent isAdmin={isAdmin} tasks={tasks} leaderboard={leaderboard} />
    </aside>
  )
}
