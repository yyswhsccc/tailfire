'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2 } from 'lucide-react'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'

export default function AgencySettingsPage() {
  return (
    <SettingsTabsLayout activeTab="agency">
      {/* Page-specific header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold">Agency Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure agency-wide preferences and branding
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="rounded-lg bg-ash-100 p-2 text-ash-400">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle>Coming Soon</CardTitle>
            <CardDescription>Agency settings is under development</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This feature will allow you to configure agency-wide settings, including branding,
            default preferences, email templates, and business information.
          </p>
        </CardContent>
      </Card>
    </SettingsTabsLayout>
  )
}
