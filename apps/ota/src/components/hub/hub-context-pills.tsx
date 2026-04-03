// apps/ota/src/components/hub/hub-context-pills.tsx

import type { ContextPill } from '@/lib/entity-hubs/types'

interface HubContextPillsProps {
  pills: ContextPill[]
  children?: React.ReactNode
}

export function HubContextPills({ pills, children }: HubContextPillsProps) {
  if (pills.length === 0 && !children) return null

  return (
    <div className="border-b border-[#E0E0E0]">
      <div className="mx-auto flex max-w-[1280px] items-center gap-2.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:px-10 lg:px-[60px]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {pills.map((pill, i) => (
          <span
            key={i}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              pill.accent
                ? 'border-[#C59746]/35 bg-[#C59746]/12 text-[#C59746] font-semibold'
                : 'border-[#E0E0E0] bg-[#faf6f0] text-[#1A1A1A]'
            }`}
          >
            {pill.icon && <span>{pill.icon}</span>}
            {pill.label}
          </span>
        ))}
        {children && <div className="ml-auto hidden sm:block">{children}</div>}
      </div>
    </div>
  )
}
