'use client'

import { Trophy } from 'lucide-react'
import type { AgentLeaderboardEntry } from '@/hooks/use-dashboard'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

interface SidebarAgentLeaderboardProps {
  agents: AgentLeaderboardEntry[]
}

export function SidebarAgentLeaderboard({ agents }: SidebarAgentLeaderboardProps) {
  if (agents.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
        <Trophy className="h-3 w-3" />
        Leaderboard
      </h4>
      <div className="space-y-2">
        {agents.map((agent, index) => (
          <div key={agent.userId} className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground w-4">{index + 1}</span>
            {agent.avatarUrl ? (
              <img
                src={agent.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                {getInitials(agent.firstName, agent.lastName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {agent.firstName} {agent.lastName}
              </p>
            </div>
            <span className="text-xs font-medium">{formatCurrency(agent.salesVolumeCents)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
