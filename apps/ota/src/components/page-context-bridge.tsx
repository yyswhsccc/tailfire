'use client'

import { useEffect } from 'react'
import { useAiPanelStore } from '@/stores/ai-panel-store'
import { trackPageView } from '@/lib/tracking'

interface PageContextBridgeProps {
  type: string
  slug: string
  name: string
  parentContext?: { type: string; slug: string; name: string }
  metadata?: Record<string, unknown>
}

export function PageContextBridge({ type, slug, name, parentContext, metadata }: PageContextBridgeProps) {
  const setPageContext = useAiPanelStore((s) => s.setPageContext)
  const clearPageContext = useAiPanelStore((s) => s.clearPageContext)
  const addPageVisit = useAiPanelStore((s) => s.addPageVisit)

  useEffect(() => {
    setPageContext({ type, slug, name, parentContext, metadata })
    addPageVisit({ type, slug, name })
    // Track page view for prospecting intelligence
    if (typeof window !== 'undefined') {
      trackPageView(type, slug, name)
    }
    return () => clearPageContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, slug, name, parentContext, setPageContext, clearPageContext, addPageVisit])

  return null
}
