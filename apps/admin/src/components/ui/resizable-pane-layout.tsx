'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaneConfig {
  defaultWidth: number
  minWidth: number
  maxWidth: number
  collapsedWidth?: number // default 20
}

interface ResizablePaneLayoutProps {
  left: PaneConfig & { children: React.ReactNode }
  center: PaneConfig & { children: React.ReactNode }
  right: { children: React.ReactNode }
  className?: string
  onLayoutChange?: (layout: {
    leftWidth: number
    centerWidth: number
    leftCollapsed: boolean
    centerCollapsed: boolean
  }) => void
  initialLayout?: {
    leftWidth?: number
    centerWidth?: number
    leftCollapsed?: boolean
    centerCollapsed?: boolean
  }
}

type DragTarget = 'left' | 'center' | null

interface DividerProps {
  position: 'left' | 'center'
  isDragging: boolean
  collapsed: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onToggle: () => void
}

function Divider({
  position,
  isDragging,
  collapsed,
  onMouseDown,
  onDoubleClick,
  onToggle,
}: DividerProps) {
  // Chevron direction:
  // - Left divider expanded → chevron points left (collapse left pane)
  // - Left divider collapsed → chevron points right (expand left pane)
  // - Center divider expanded → chevron points left (collapse center pane)
  // - Center divider collapsed → chevron points right (expand center pane)
  const ChevronIcon = collapsed ? ChevronRight : ChevronLeft

  return (
    <div
      className={cn(
        'relative flex-shrink-0 w-[4px] cursor-col-resize group',
        'flex items-center justify-center',
        isDragging ? 'bg-primary/40' : 'hover:bg-primary/20',
        'transition-colors duration-150',
      )}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Visible 1px line */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />

      {/* Chevron button */}
      <button
        type="button"
        className={cn(
          'relative z-10 flex items-center justify-center',
          'w-5 h-5 rounded-full bg-background border shadow-sm',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          'hover:bg-accent',
          isDragging && 'opacity-100',
        )}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${position} pane`}
      >
        <ChevronIcon className="h-3 w-3" />
      </button>
    </div>
  )
}

function CollapsedPane({
  side,
  onExpand,
  width,
}: {
  side: 'left' | 'center'
  onExpand: () => void
  width: number
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center bg-muted/30"
      style={{ width }}
    >
      <button
        type="button"
        className={cn(
          'flex items-center justify-center',
          'w-5 h-5 rounded-full bg-background border shadow-sm',
          'hover:bg-accent transition-colors duration-150',
        )}
        onClick={onExpand}
        aria-label={`Expand ${side} pane`}
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  )
}

export function ResizablePaneLayout({
  left,
  center,
  right,
  className,
  onLayoutChange,
  initialLayout,
}: ResizablePaneLayoutProps) {
  const leftCollapsedWidth = left.collapsedWidth ?? 20
  const centerCollapsedWidth = center.collapsedWidth ?? 20

  const [leftWidth, setLeftWidth] = React.useState(
    initialLayout?.leftWidth ?? left.defaultWidth,
  )
  const [centerWidth, setCenterWidth] = React.useState(
    initialLayout?.centerWidth ?? center.defaultWidth,
  )
  const [leftCollapsed, setLeftCollapsed] = React.useState(
    initialLayout?.leftCollapsed ?? false,
  )
  const [centerCollapsed, setCenterCollapsed] = React.useState(
    initialLayout?.centerCollapsed ?? false,
  )

  const [dragTarget, setDragTarget] = React.useState<DragTarget>(null)
  const dragStartX = React.useRef(0)
  const dragStartWidth = React.useRef(0)

  // Stable ref for onLayoutChange to avoid re-render loops
  const onLayoutChangeRef = React.useRef(onLayoutChange)
  onLayoutChangeRef.current = onLayoutChange

  // Fire onLayoutChange when layout state changes (user-initiated only)
  const isInitialRender = React.useRef(true)
  React.useEffect(() => {
    // Skip the initial render to avoid loop with persisted initialLayout
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    onLayoutChangeRef.current?.({
      leftWidth,
      centerWidth,
      leftCollapsed,
      centerCollapsed,
    })
  }, [leftWidth, centerWidth, leftCollapsed, centerCollapsed])

  // Handle mouse drag
  React.useEffect(() => {
    if (!dragTarget) return

    function handleMouseMove(e: MouseEvent) {
      const delta = e.clientX - dragStartX.current

      if (dragTarget === 'left') {
        const newWidth = Math.min(
          left.maxWidth,
          Math.max(left.minWidth, dragStartWidth.current + delta),
        )
        setLeftWidth(newWidth)
      } else if (dragTarget === 'center') {
        const newWidth = Math.min(
          center.maxWidth,
          Math.max(center.minWidth, dragStartWidth.current + delta),
        )
        setCenterWidth(newWidth)
      }
    }

    function handleMouseUp() {
      setDragTarget(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragTarget, left.minWidth, left.maxWidth, center.minWidth, center.maxWidth])

  const handleDividerMouseDown = React.useCallback(
    (target: 'left' | 'center', e: React.MouseEvent) => {
      e.preventDefault()
      dragStartX.current = e.clientX
      dragStartWidth.current = target === 'left' ? leftWidth : centerWidth
      setDragTarget(target)
    },
    [leftWidth, centerWidth],
  )

  const toggleLeftCollapsed = React.useCallback(() => {
    setLeftCollapsed((prev) => !prev)
  }, [])

  const toggleCenterCollapsed = React.useCallback(() => {
    setCenterCollapsed((prev) => !prev)
  }, [])

  const isDragging = dragTarget !== null

  return (
    <div
      className={cn(
        'flex h-full overflow-hidden',
        isDragging && 'select-none cursor-col-resize',
        className,
      )}
    >
      {/* Left pane */}
      {leftCollapsed ? (
        <CollapsedPane
          side="left"
          onExpand={toggleLeftCollapsed}
          width={leftCollapsedWidth}
        />
      ) : (
        <div
          className="flex-shrink-0 overflow-hidden flex flex-col"
          style={{ width: leftWidth }}
        >
          {left.children}
        </div>
      )}

      {/* Divider between left and center */}
      <Divider
        position="left"
        isDragging={dragTarget === 'left'}
        collapsed={leftCollapsed}
        onMouseDown={(e) => handleDividerMouseDown('left', e)}
        onDoubleClick={toggleLeftCollapsed}
        onToggle={toggleLeftCollapsed}
      />

      {/* Center pane */}
      {centerCollapsed ? (
        <CollapsedPane
          side="center"
          onExpand={toggleCenterCollapsed}
          width={centerCollapsedWidth}
        />
      ) : (
        <div
          className="flex-shrink-0 overflow-hidden flex flex-col"
          style={{ width: centerWidth }}
        >
          {center.children}
        </div>
      )}

      {/* Divider between center and right */}
      <Divider
        position="center"
        isDragging={dragTarget === 'center'}
        collapsed={centerCollapsed}
        onMouseDown={(e) => handleDividerMouseDown('center', e)}
        onDoubleClick={toggleCenterCollapsed}
        onToggle={toggleCenterCollapsed}
      />

      {/* Right pane (fills remaining space) */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {right.children}
      </div>
    </div>
  )
}

export type { PaneConfig, ResizablePaneLayoutProps }
