'use client'

import { useState, useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { GuideContent } from './guide-content'
import { GuideToc } from './guide-toc'
import { getTopicForRoute, GUIDE_TOPICS } from './guide-route-map'
import { guideContent } from '@/content/guide'

interface HelpGuideSheetInnerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTopic?: string
}

function HelpGuideSheetInner({
  open,
  onOpenChange,
  initialTopic,
}: HelpGuideSheetInnerProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [currentTopic, setCurrentTopic] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      if (initialTopic) {
        setCurrentTopic(initialTopic)
      } else {
        const tab = searchParams.get('tab')
        const detected = getTopicForRoute(pathname, tab)
        setCurrentTopic(detected)
      }
    }
  }, [open, pathname, searchParams, initialTopic])

  const topicIndex = currentTopic
    ? GUIDE_TOPICS.findIndex((t) => t.id === currentTopic)
    : -1
  const currentTopicMeta = topicIndex >= 0 ? GUIDE_TOPICS[topicIndex] : null
  const prevTopic = topicIndex > 0 ? GUIDE_TOPICS[topicIndex - 1] : null
  const nextTopic =
    topicIndex >= 0 && topicIndex < GUIDE_TOPICS.length - 1
      ? GUIDE_TOPICS[topicIndex + 1]
      : null

  const content = currentTopic ? guideContent[currentTopic] : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] p-0 flex flex-col"
      >
        {/* Accessible title (visually hidden) */}
        <SheetTitle className="sr-only">
          {currentTopicMeta?.title || 'Help Guide'}
        </SheetTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-zinc-50">
          <div className="flex items-center gap-2">
            {currentTopic && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentTopic(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-900">
                {currentTopicMeta?.title || 'Guide'}
              </span>
            </div>
          </div>
          {currentTopic && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setCurrentTopic(null)}
            >
              All Topics
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            {content ? (
              <GuideContent content={content} />
            ) : (
              <GuideToc onSelectTopic={setCurrentTopic} />
            )}
          </div>
        </ScrollArea>

        {/* Footer — prev/next */}
        {currentTopic && (prevTopic || nextTopic) && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-xs bg-zinc-50">
            {prevTopic ? (
              <button
                onClick={() => setCurrentTopic(prevTopic.id)}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
                {prevTopic.title}
              </button>
            ) : (
              <span />
            )}
            {nextTopic ? (
              <button
                onClick={() => setCurrentTopic(nextTopic.id)}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                {nextTopic.title}
                <ChevronRight className="h-3 w-3" />
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export interface HelpGuideSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTopic?: string
}

export function HelpGuideSheet(props: HelpGuideSheetProps) {
  return (
    <Suspense>
      <HelpGuideSheetInner {...props} />
    </Suspense>
  )
}
