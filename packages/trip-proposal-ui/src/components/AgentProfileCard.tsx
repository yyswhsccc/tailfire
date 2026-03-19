'use client'

import { Phone } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback, Card, CardContent } from '@tailfire/ui-public'
import type { SharedAgentProfileDto } from '@tailfire/shared-types/api'

export function AgentProfileCard({ agent }: { agent: SharedAgentProfileDto }) {
  const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(' ')
  const initials = [agent.firstName?.[0], agent.lastName?.[0]].filter(Boolean).join('')

  if (!fullName) return null

  return (
    <div className="max-w-3xl mx-auto px-4 mt-6">
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center gap-4">
          <Avatar className="h-12 w-12 shrink-0">
            {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} alt={fullName} />}
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{fullName}</p>
            <p className="text-xs text-muted-foreground">Your Travel Advisor</p>
            {agent.bio && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{agent.bio}</p>
            )}
          </div>
          {agent.publicPhone && (
            <a
              href={`tel:${agent.publicPhone}`}
              className="shrink-0 text-primary hover:text-primary/80 transition-colors"
            >
              <Phone className="h-5 w-5" />
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
