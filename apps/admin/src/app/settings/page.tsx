'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Key, Ship, Users, Building2, Info, Mail } from 'lucide-react'
import { SettingsTabsLayout } from './_components/settings-tabs-layout'

// Build info - set at build time
const BUILD_INFO = {
  timestamp: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1',
}

interface SettingsCategoryCard {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  available: boolean
}

const settingsCategories: SettingsCategoryCard[] = [
  {
    title: 'API Credentials',
    description: 'Manage API keys and credentials for external integrations',
    href: '/settings/api-credentials',
    icon: <Key className="h-6 w-6" />,
    available: true,
  },
  {
    title: 'Cruise Sync',
    description: 'Configure and monitor cruise line data synchronization',
    href: '/settings/cruise-sync',
    icon: <Ship className="h-6 w-6" />,
    available: true,
  },
  {
    title: 'User Management',
    description: 'Manage team members and user permissions',
    href: '/settings/users',
    icon: <Users className="h-6 w-6" />,
    available: true,
  },
  {
    title: 'Email Integration',
    description: 'Manage allowed email domains and compliance footer',
    href: '/settings/email',
    icon: <Mail className="h-6 w-6" />,
    available: true,
  },
  {
    title: 'Agency Settings',
    description: 'Configure agency-wide preferences and branding',
    href: '/settings/agency',
    icon: <Building2 className="h-6 w-6" />,
    available: false,
  },
]

export default function SettingsPage() {
  return (
    <SettingsTabsLayout activeTab="overview">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {settingsCategories.map((category) => (
          <Card
            key={category.title}
            className={
              category.available
                ? 'transition-colors hover:border-phoenix-gold-500'
                : 'opacity-60'
            }
          >
            {category.available ? (
              <Link href={category.href} className="block">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-lg bg-phoenix-gold-50 p-2 text-phoenix-gold-600">
                    {category.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </div>
                </CardHeader>
              </Link>
            ) : (
              <>
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-lg bg-ash-100 p-2 text-ash-400">
                    {category.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Coming soon</p>
                </CardContent>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* System Info - for verifying deployments */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="rounded-lg bg-ash-100 p-2 text-ash-600">
            <Info className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">System Info</CardTitle>
            <CardDescription>Build and environment details</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
            <div>
              <dt className="font-medium text-muted-foreground">Environment</dt>
              <dd className="font-mono">{BUILD_INFO.environment}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">API URL</dt>
              <dd className="font-mono text-xs break-all">{BUILD_INFO.apiUrl}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Build Time</dt>
              <dd className="font-mono text-xs">{BUILD_INFO.timestamp}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </SettingsTabsLayout>
  )
}
