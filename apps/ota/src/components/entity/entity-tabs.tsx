'use client'

import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Tab {
  label: string
  href: string
  count?: number
}

interface EntityTabsProps {
  tabs: Tab[]
}

export function EntityTabs({ tabs }: EntityTabsProps) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="border-b border-border">
      <nav className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={cn(
                'shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-[#C59746] text-[#C59746]'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className="ml-1.5 text-xs text-muted-foreground">({tab.count})</span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
