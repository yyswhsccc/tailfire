'use client'

import Link from 'next/link'
import { TernDashboardLayout } from '@/components/tern/layout'
import { cn } from '@/lib/utils'

interface SettingsTabsLayoutProps {
  children: React.ReactNode
  activeTab: string
}

interface SettingsTab {
  id: string
  label: string
  href: string
  disabled?: boolean
}

const settingsTabs: SettingsTab[] = [
  { id: 'overview', label: 'Overview', href: '/settings' },
  { id: 'api-credentials', label: 'API Credentials', href: '/settings/api-credentials' },
  { id: 'cruise-sync', label: 'Cruise Sync', href: '/settings/cruise-sync' },
  { id: 'automation', label: 'Automation', href: '/settings/automation' },
  { id: 'users', label: 'Users', href: '/settings/users' },
  { id: 'agency', label: 'Agency', href: '/settings/agency', disabled: true },
]

export function SettingsTabsLayout({ children, activeTab }: SettingsTabsLayoutProps) {
  return (
    <TernDashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Settings</h2>
          <p className="text-muted-foreground">
            Manage system configuration and agency settings
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-tern-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Settings tabs">
            {settingsTabs.map((tab) => {
              const isActive = activeTab === tab.id

              // Disabled tabs still show as links but with muted styling
              // They remain navigable since the pages exist (just show "Coming Soon")
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-tern-teal-500 text-tern-teal-600'
                      : tab.disabled
                        ? 'border-transparent text-muted-foreground/50'
                        : 'border-transparent text-muted-foreground hover:border-tern-gray-300 hover:text-foreground'
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </TernDashboardLayout>
  )
}
