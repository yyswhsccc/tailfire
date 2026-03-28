'use client'

import { useEffect } from 'react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface PageContextBridgeProps {
  type: string
  slug: string
  name: string
  parentContext?: { type: string; slug: string; name: string }
}

/**
 * Invisible client component that pushes page context into the Zustand store.
 * Drop this into any entity page's Server Component to inform the AI panel
 * about what the user is currently viewing.
 *
 * Example usage in a Server Component:
 *   <PageContextBridge type="destination" slug="miami-fl-us" name="Miami" />
 */
export function PageContextBridge({ type, slug, name, parentContext }: PageContextBridgeProps) {
  const setPageContext = useAiPanelStore((s) => s.setPageContext)
  const clearPageContext = useAiPanelStore((s) => s.clearPageContext)

  useEffect(() => {
    setPageContext({ type, slug, name, parentContext })
    return () => clearPageContext()
  }, [type, slug, name, parentContext, setPageContext, clearPageContext])

  return null // No UI — just pushes context into store
}
