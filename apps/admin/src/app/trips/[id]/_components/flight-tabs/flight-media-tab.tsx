'use client'

import { ImageIcon } from 'lucide-react'
import { ComponentMediaTab } from '@/components/shared'
import { EmptyState } from '@/components/shared/empty-state'
import { Card } from '@/components/ui/card'

interface FlightMediaTabProps {
  /** The flight component ID (only available when editing) */
  componentId?: string
}

export function FlightMediaTab({ componentId }: FlightMediaTabProps) {
  // Show message when creating a new flight (no ID yet)
  if (!componentId) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" />}
          title="Save flight first"
          description="You can add photos after saving the flight"
        />
      </Card>
    )
  }

  return (
    <ComponentMediaTab
      componentId={componentId}
      entityType="flight"
      title="Flight Photos"
      description="Boarding passes, seat maps, and flight experience photos"
    />
  )
}
