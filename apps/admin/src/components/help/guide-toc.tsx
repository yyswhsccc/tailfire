'use client'

import { GUIDE_TOPICS, CATEGORY_LABELS, type GuideTopic } from './guide-route-map'
import { ChevronRight } from 'lucide-react'

interface GuideTocProps {
  onSelectTopic: (topicId: string) => void
}

export function GuideToc({ onSelectTopic }: GuideTocProps) {
  const grouped = GUIDE_TOPICS.reduce<Record<string, GuideTopic[]>>(
    (acc, topic) => {
      const list = acc[topic.category] ?? []
      list.push(topic)
      acc[topic.category] = list
      return acc
    },
    {},
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Tailfire Guide</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Everything you need to manage trips, bookings, and clients.
        </p>
      </div>
      {Object.entries(grouped).map(([category, topics]) => (
        <div key={category}>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABELS[category] || category}
          </h2>
          <div className="space-y-1">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic.id)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 transition-colors group flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    {topic.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {topic.description}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
