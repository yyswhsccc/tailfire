'use client'

import { Clock, Play, CheckCircle2, XCircle, Timer, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useQueueCounts, transformQueuesResponse, type QueueCountsWithName } from '@/hooks/use-automation'
import { cn } from '@/lib/utils'

interface QueueCardProps {
  queue: QueueCountsWithName
  onViewDelayed?: (queueName: string) => void
}

function QueueCard({ queue, onViewDelayed }: QueueCardProps) {
  const total = queue.waiting + queue.active + queue.delayed
  const hasActivity = total > 0 || queue.completed > 0 || queue.failed > 0

  return (
    <Card className={cn(!hasActivity && 'opacity-60')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg capitalize">
            {queue.name.replace('-', ' ')}
          </CardTitle>
          {queue.active > 0 && (
            <Badge variant="default" className="bg-green-500">
              <Play className="mr-1 h-3 w-3" />
              Active
            </Badge>
          )}
        </div>
        <CardDescription>
          {queue.name === 'trip-automation' && 'Trip status transitions & reminders'}
          {queue.name === 'client-care' && 'Emails, follow-ups, birthdays'}
          {queue.name === 'notifications' && 'Push, email, SMS delivery'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <div className="flex items-center justify-center text-amber-600">
              <Clock className="mr-1 h-4 w-4" />
              <span className="text-2xl font-bold">{queue.waiting}</span>
            </div>
            <p className="text-xs text-muted-foreground">Waiting</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center text-blue-600">
              <Timer className="mr-1 h-4 w-4" />
              <span className="text-2xl font-bold">{queue.delayed}</span>
            </div>
            <p className="text-xs text-muted-foreground">Delayed</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center text-green-600">
              <Play className="mr-1 h-4 w-4" />
              <span className="text-2xl font-bold">{queue.active}</span>
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
          <div className="flex items-center gap-4">
            <span className="flex items-center text-green-600">
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {queue.completed.toLocaleString()} completed
            </span>
            {queue.failed > 0 && (
              <span className="flex items-center text-red-600">
                <XCircle className="mr-1 h-4 w-4" />
                {queue.failed} failed
              </span>
            )}
          </div>
          {queue.delayed > 0 && onViewDelayed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDelayed(queue.name)}
            >
              View Delayed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface QueueStatusCardsProps {
  onViewDelayed?: (queueName: string) => void
}

export function QueueStatusCards({ onViewDelayed }: QueueStatusCardsProps) {
  const { data, isLoading, refetch, isFetching } = useQueueCounts()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 w-32 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-12 rounded bg-muted" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A'}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {data && transformQueuesResponse(data).map((queue) => (
          <QueueCard
            key={queue.name}
            queue={queue}
            onViewDelayed={onViewDelayed}
          />
        ))}
      </div>
    </div>
  )
}
