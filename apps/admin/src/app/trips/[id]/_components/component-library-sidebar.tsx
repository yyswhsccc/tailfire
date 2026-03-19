'use client'

import { useState } from 'react'
import { FileText, Sparkles, ChevronDown, ChevronUp, Library, Compass, Anchor, MapPin } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIDEBAR_WIDTH, ITINERARY_CARD_STYLES, FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ACTIVITY_TYPE_METADATA, isValidActivityType } from '@/lib/activity-constants'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import type { ComponentDragData } from '@/lib/dnd-config'

interface DraggableComponentProps {
  id: string
  componentType: string
  label: string
  icon?: React.ElementType
}

function DraggableComponent({ id, componentType, label, icon: Icon }: DraggableComponentProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: {
      type: 'component',
      componentType,
      label,
    } as ComponentDragData,
  })

  const isActivityType = isValidActivityType(componentType)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`Drag to add ${label}`}
      className={cn(
        'flex items-center gap-2 p-2 rounded-md border border-ash-200 cursor-grab active:cursor-grabbing',
        'hover:bg-ash-50 hover:border-ash-300 transition-all',
        FOCUS_VISIBLE_RING,
        isDragging && 'opacity-50 border-phoenix-gold-500 shadow-sm'
      )}
    >
      {isActivityType ? (
        <ActivityIconBadge type={componentType} size="sm" shape="square" />
      ) : Icon ? (
        <Icon className="h-4 w-4 text-ash-500" />
      ) : null}
      <span className="text-xs text-ash-900">{label}</span>
      <div className="ml-auto">
        <div className="h-4 w-4 text-ash-400">⋮⋮</div>
      </div>
    </div>
  )
}

function CancelDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'cancel-drop-zone',
    data: { type: 'cancel' },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed transition-all',
        isOver
          ? 'border-red-400 bg-red-50 text-red-700'
          : 'border-ash-300 bg-ash-50 text-ash-500'
      )}
    >
      <X className="h-4 w-4" />
      <span className="text-sm font-medium">
        {isOver ? 'Release to cancel' : 'Drop here to cancel'}
      </span>
    </div>
  )
}

export function ComponentLibrarySidebar({ isDragging = false }: { isDragging?: boolean }) {
  const [aiAssistExpanded, setAiAssistExpanded] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')

  return (
    <div className={cn(SIDEBAR_WIDTH, ITINERARY_CARD_STYLES, 'overflow-y-auto')}>
      <div className="p-3 space-y-3">
        {/* Cancel zone when dragging */}
        {isDragging && <CancelDropZone />}

        {/* Header */}
        <h3 className="text-base font-semibold text-ash-900">Build your trip</h3>

        {/* AI Assist Section */}
        <div className="border border-ash-200 rounded-md overflow-hidden">
          <button
            onClick={() => setAiAssistExpanded(!aiAssistExpanded)}
            aria-expanded={aiAssistExpanded}
            aria-controls="ai-assist-content"
            className={cn(
              'w-full flex items-center justify-between p-2.5 hover:bg-ash-50 transition-colors',
              FOCUS_VISIBLE_RING
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h4 className="font-medium text-xs text-ash-900">AI Assist</h4>
            </div>
            {aiAssistExpanded ? (
              <ChevronUp className="h-3 w-3 text-ash-500" />
            ) : (
              <ChevronDown className="h-3 w-3 text-ash-500" />
            )}
          </button>

          {aiAssistExpanded && (
            <div id="ai-assist-content" className="p-2.5 space-y-2 border-t border-ash-200">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Quickly build your itinerary by uploading a PDF or copying and pasting in itinerary content."
                rows={3}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Upload
                </Button>
                <Button size="sm" className="h-8 text-xs bg-phoenix-gold-500 hover:bg-phoenix-gold-600">
                  Submit
                </Button>
              </div>
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 justify-start text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Draft Destination Guide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 justify-start text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Draft Packing List
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Library Items */}
        <div role="group" aria-labelledby="library-items-heading">
          <p id="library-items-heading" className="text-xs font-medium text-ash-500 mb-2">Library Items</p>
          <div className="space-y-1.5">
            <DraggableComponent
              id="library-itinerary"
              componentType="library-item"
              label="Package Library"
              icon={Library}
            />
            <DraggableComponent
              id="library-activity"
              componentType="library-item"
              label="Activity Library"
              icon={Compass}
            />
            <DraggableComponent
              id="library-cruise"
              componentType="library-item"
              label="Cruise Library"
              icon={Anchor}
            />
            <DraggableComponent
              id="library-tour"
              componentType="library-item"
              label="Tour Library"
              icon={MapPin}
            />
          </div>
        </div>

        {/* Trip Components */}
        <div role="group" aria-labelledby="trip-components-heading">
          <p id="trip-components-heading" className="text-xs font-medium text-ash-500 mb-2">Trip Components</p>
          <div className="space-y-1.5">
            {Object.entries(ACTIVITY_TYPE_METADATA)
              .filter(([_, metadata]) => !metadata.hidden)
              .map(([type, metadata]) => (
              <DraggableComponent
                key={`component-${type}`}
                id={`component-${type}`}
                componentType={type}
                label={metadata.label}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
