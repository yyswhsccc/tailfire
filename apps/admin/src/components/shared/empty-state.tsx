import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

/**
 * Empty State
 * Display when there's no data to show
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 rounded-full bg-ash-100 p-3 text-ash-400">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-base font-semibold text-ash-900">
        {title}
      </h3>
      {description && (
        <p className="mb-4 text-sm text-ash-500 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}
