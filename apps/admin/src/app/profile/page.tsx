'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyProfile } from '@/hooks/use-user-profile'
import { UserAvatar } from '@/components/user/user-avatar'
import { ProfileFormProvider, useProfileForm } from './_components/profile-form-context'
import { PublicProfileTab } from './_components/public-profile-tab'
import { AgentInfoTab } from './_components/agent-info-tab'
import { PreferencesTab } from './_components/preferences-tab'
import { NotificationsTab } from './_components/notifications-tab'
import { SecurityTab } from './_components/security-tab'
import { EmailTab } from './_components/email-tab'

function ProfilePageHeader() {
  const { data: profile, isLoading } = useMyProfile()

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'User'

  return (
    <div className="flex items-center gap-4">
      <UserAvatar
        firstName={profile?.firstName}
        lastName={profile?.lastName}
        avatarUrl={profile?.avatarUrl}
        size="lg"
      />
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{fullName}</h2>
        <p className="text-muted-foreground">{profile?.email}</p>
      </div>
    </div>
  )
}

function ComingSoonTab({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>This feature is in development</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This section is being built and will be available in a future update.
        </p>
      </CardContent>
    </Card>
  )
}

// Tabs that have form registration (show Save button)
const SAVEABLE_TABS = ['public', 'agent', 'preferences', 'notifications', 'email']

function ProfileContent() {
  const { activeTab, setActiveTab, submitActiveForm, isSubmitting } = useProfileForm()

  // Determine if current tab is saveable
  const showSaveButton = SAVEABLE_TABS.includes(activeTab)

  const handleSave = async () => {
    await submitActiveForm()
  }

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <ProfilePageHeader />
        {showSaveButton && (
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Controlled Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="public">Public Profile</TabsTrigger>
          <TabsTrigger value="agent">Agent Info</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PublicProfileTab />
        </TabsContent>

        <TabsContent value="agent">
          <AgentInfoTab />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="email">
          <EmailTab />
        </TabsContent>

        <TabsContent value="templates">
          <ComingSoonTab title="Templates" />
        </TabsContent>

        <TabsContent value="tags">
          <ComingSoonTab title="Tags" />
        </TabsContent>

        <TabsContent value="marketing">
          <ComingSoonTab title="Marketing" />
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ProfilePageLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function ProfilePage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<ProfilePageLoading />}>
        <ProfileFormProvider defaultTab="public">
          <ProfileContent />
        </ProfileFormProvider>
      </Suspense>
    </DashboardLayout>
  )
}
