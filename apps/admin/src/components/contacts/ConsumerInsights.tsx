'use client'

import type { ElementType } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Eye, Search, TrendingUp, MessageSquare, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityEvent {
  id: string
  event: string
  entityType: string | null
  entitySlug: string | null
  entityName: string | null
  searchQuery: Record<string, unknown> | null
  createdAt: string
}

interface PurchaseSignal {
  label: string
  strength: 'high' | 'medium' | 'low'
}

interface ConsumerInsight {
  id: string
  type: string
  summary: string | null
  facts: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

function useConsumerActivity(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId, 'consumer-activity'],
    queryFn: () =>
      api.get<ActivityEvent[]>(`/consumer-activity/by-contact/${contactId}?limit=30`),
    enabled: Boolean(contactId),
  })
}

function useConsumerSignals(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId, 'consumer-signals'],
    queryFn: () =>
      api.get<PurchaseSignal[]>(`/consumer-activity/signals/${contactId}`),
    enabled: Boolean(contactId),
  })
}

function useConsumerInsights(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId, 'consumer-insights'],
    queryFn: () =>
      api.get<ConsumerInsight[]>(`/consumer-activity/insights/${contactId}`),
    enabled: Boolean(contactId),
  })
}

const EVENT_ICONS: Record<string, ElementType> = {
  page_view: Eye,
  search: Search,
  board_save: TrendingUp,
  ai_chat_start: MessageSquare,
}

const STRENGTH_COLORS: Record<PurchaseSignal['strength'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700',
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function describeEvent(e: ActivityEvent): string {
  switch (e.event) {
    case 'page_view':
      return `Viewed ${e.entityName ?? e.entitySlug ?? e.entityType ?? 'page'}`
    case 'search':
      return `Searched ${e.entityType ?? 'content'}: ${JSON.stringify(e.searchQuery ?? {}).slice(0, 60)}`
    case 'board_save':
      return 'Saved to dream board'
    case 'ai_chat_start':
      return 'Started AI chat'
    default:
      return e.event
  }
}

function ConsumerInsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  )
}

interface ConsumerInsightsProps {
  contactId: string
}

export function ConsumerInsights({ contactId }: ConsumerInsightsProps) {
  const { data: activity, isLoading: actLoading } = useConsumerActivity(contactId)
  const { data: signals, isLoading: sigLoading } = useConsumerSignals(contactId)
  const { data: insights } = useConsumerInsights(contactId)

  if (actLoading || sigLoading) {
    return <ConsumerInsightsSkeleton />
  }

  const hasData =
    (activity && activity.length > 0) ||
    (signals && signals.length > 0) ||
    (insights && insights.length > 0)

  if (!hasData) {
    return (
      <div className="p-8 text-center">
        <Eye className="mx-auto mb-3 h-12 w-12 text-ash-300" />
        <p className="text-sm text-ash-900 mb-1">No consumer activity yet</p>
        <p className="text-sm text-ash-500">
          Activity will appear here when this contact browses the OTA portal.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {/* Purchase Signals */}
      {signals && signals.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ash-900">
            <TrendingUp className="h-4 w-4" />
            Purchase Signals
          </h3>
          <div className="flex flex-wrap gap-2">
            {signals.map((s, i) => (
              <span
                key={i}
                className={`rounded-full px-3 py-1 text-xs font-medium ${STRENGTH_COLORS[s.strength]}`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Conversation Summaries */}
      {insights && insights.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ash-900">
            <MessageSquare className="h-4 w-4" />
            AI Conversations
          </h3>
          <div className="space-y-2">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-lg border border-ash-200 bg-white p-3"
              >
                <p className="text-sm text-ash-900">{insight.summary}</p>
                <p className="mt-1 text-xs text-ash-500">{formatTimeAgo(insight.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Timeline */}
      {activity && activity.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ash-900">
            <Clock className="h-4 w-4" />
            Recent Activity
          </h3>
          <div className="space-y-1">
            {activity.slice(0, 20).map((e) => {
              const Icon = EVENT_ICONS[e.event] ?? Eye
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ash-50"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-ash-400" />
                  <span className="flex-1 truncate text-ash-700">{describeEvent(e)}</span>
                  <span className="shrink-0 text-xs text-ash-500">{formatTimeAgo(e.createdAt)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
