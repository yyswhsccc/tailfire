'use client'

/**
 * Notifications Tab
 *
 * Notification preferences settings for the user profile.
 * Allows users to configure:
 * - Master channel toggles (email, push, in-app)
 * - Category-specific channel preferences
 * - Quiet hours
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Bell, Mail, Smartphone, Monitor, Moon, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/use-notification-preferences'
import { useProfileForm } from './profile-form-context'
import type {
  NotificationCategory,
  NotificationChannel,
} from '@tailfire/shared-types/api'

/**
 * Notification category display info
 */
const CATEGORY_INFO: Record<NotificationCategory, { label: string; description: string }> = {
  payment_reminders: {
    label: 'Payment Reminders',
    description: 'Reminders about upcoming and overdue payments',
  },
  trip_updates: {
    label: 'Trip Updates',
    description: 'Status changes, start/end dates, and trip milestones',
  },
  client_care: {
    label: 'Client Care',
    description: 'Client communication and follow-up reminders',
  },
  booking_alerts: {
    label: 'Booking Alerts',
    description: 'Booking confirmations and booking-related updates',
  },
  system_alerts: {
    label: 'System Alerts',
    description: 'Important system notifications and announcements',
  },
  assignment: {
    label: 'Assignments',
    description: 'When trips or leads are assigned to you',
  },
  collaboration: {
    label: 'Collaboration',
    description: 'Comments, mentions, and team activity',
  },
  payment_alert: {
    label: 'Payment Alerts',
    description: 'Payment received, overdue, or status changes',
  },
}

const CATEGORIES = Object.keys(CATEGORY_INFO) as NotificationCategory[]

const COMMON_TIMEZONES = [
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  { value: 'America/Winnipeg', label: 'Central Time (Winnipeg)' },
  { value: 'America/Edmonton', label: 'Mountain Time (Edmonton)' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
  { value: 'America/Halifax', label: 'Atlantic Time (Halifax)' },
  { value: 'America/St_Johns', label: 'Newfoundland Time (St. Johns)' },
  { value: 'UTC', label: 'UTC' },
]

interface NotificationsFormData {
  emailEnabled: boolean
  pushEnabled: boolean
  platformEnabled: boolean
  categoryPreferences: Partial<Record<NotificationCategory, NotificationChannel[]>>
  quietHoursStart: string
  quietHoursEnd: string
  timezone: string
}

export function NotificationsTab() {
  const { toast } = useToast()
  const { data: preferences, isLoading } = useNotificationPreferences()
  const updatePreferences = useUpdateNotificationPreferences()
  const { registerForm, unregisterForm, notifyPendingChange, isSubmitting } = useProfileForm()

  // Default category preferences
  const defaultCategoryPreferences: Partial<Record<NotificationCategory, NotificationChannel[]>> = useMemo(() => ({
    payment_reminders: ['email', 'platform'],
    trip_updates: ['email', 'push', 'platform'],
    client_care: ['email'],
    booking_alerts: ['email', 'push', 'platform'],
    system_alerts: ['platform'],
    assignment: ['email', 'push', 'platform'],
    collaboration: ['email', 'platform'],
    payment_alert: ['email', 'push', 'platform'],
  }), [])

  const form = useForm<NotificationsFormData>({
    defaultValues: {
      emailEnabled: true,
      pushEnabled: false,
      platformEnabled: true,
      categoryPreferences: defaultCategoryPreferences,
      quietHoursStart: '',
      quietHoursEnd: '',
      timezone: 'America/Toronto',
    },
  })

  // Reset form when preferences load
  useEffect(() => {
    if (preferences) {
      form.reset({
        emailEnabled: preferences.emailEnabled,
        pushEnabled: preferences.pushEnabled,
        platformEnabled: preferences.platformEnabled,
        categoryPreferences: { ...defaultCategoryPreferences, ...preferences.categoryPreferences },
        quietHoursStart: preferences.quietHoursStart || '',
        quietHoursEnd: preferences.quietHoursEnd || '',
        timezone: preferences.timezone || 'America/Toronto',
      })
    }
  }, [preferences, form, defaultCategoryPreferences])

  const onSubmit = useCallback(async (data: NotificationsFormData) => {
    try {
      await updatePreferences.mutateAsync({
        emailEnabled: data.emailEnabled,
        pushEnabled: data.pushEnabled,
        platformEnabled: data.platformEnabled,
        categoryPreferences: data.categoryPreferences,
        quietHoursStart: data.quietHoursStart || null,
        quietHoursEnd: data.quietHoursEnd || null,
        timezone: data.timezone,
      })
      toast({
        title: 'Notification preferences updated',
        description: 'Your notification settings have been saved.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update notification preferences. Please try again.',
        variant: 'destructive',
      })
    }
  }, [updatePreferences, toast])

  // Stable submit function for form registry
  const handleFormSubmit = useCallback(async () => {
    await form.handleSubmit(onSubmit)()
  }, [form, onSubmit])

  // Register form with context
  useEffect(() => {
    registerForm('notifications', {
      submit: handleFormSubmit,
      isPending: updatePreferences.isPending,
    })
    return () => unregisterForm('notifications')
  }, [registerForm, unregisterForm, handleFormSubmit, updatePreferences.isPending])

  // Notify context when pending state changes
  useEffect(() => {
    notifyPendingChange()
  }, [updatePreferences.isPending, notifyPendingChange])

  // Helper to toggle a channel for a category
  const toggleCategoryChannel = useCallback((
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean
  ) => {
    const current = form.getValues('categoryPreferences')
    const currentChannels = current[category] || []

    let newChannels: NotificationChannel[]
    if (enabled) {
      newChannels = [...new Set([...currentChannels, channel])]
    } else {
      newChannels = currentChannels.filter(c => c !== channel)
    }

    form.setValue('categoryPreferences', {
      ...current,
      [category]: newChannels,
    })
  }, [form])

  // Check if a channel is enabled for a category
  const isCategoryChannelEnabled = useCallback((
    category: NotificationCategory,
    channel: NotificationChannel
  ) => {
    const prefs = form.watch('categoryPreferences')
    return prefs[category]?.includes(channel) ?? false
  }, [form])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Master Channel Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>
            Enable or disable notification delivery channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="emailEnabled">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
            </div>
            <Switch
              id="emailEnabled"
              checked={form.watch('emailEnabled')}
              onCheckedChange={(checked) => form.setValue('emailEnabled', checked)}
            />
          </div>

          {/* Push Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="pushEnabled">Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications on your mobile device
                </p>
              </div>
            </div>
            <Switch
              id="pushEnabled"
              checked={form.watch('pushEnabled')}
              onCheckedChange={(checked) => form.setValue('pushEnabled', checked)}
            />
          </div>

          {/* Platform Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="platformEnabled">In-App Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Show notifications in the notification bell
                </p>
              </div>
            </div>
            <Switch
              id="platformEnabled"
              checked={form.watch('platformEnabled')}
              onCheckedChange={(checked) => form.setValue('platformEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Category Preferences</CardTitle>
          <CardDescription>
            Choose which channels to use for each notification type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
              <div>Category</div>
              <div className="text-center">Email</div>
              <div className="text-center">Push</div>
              <div className="text-center">In-App</div>
            </div>

            {/* Category rows */}
            {CATEGORIES.map((category) => (
              <div
                key={category}
                className="grid grid-cols-[1fr_80px_80px_80px] gap-4 items-center py-2"
              >
                <div>
                  <div className="font-medium text-sm">{CATEGORY_INFO[category].label}</div>
                  <div className="text-xs text-muted-foreground">
                    {CATEGORY_INFO[category].description}
                  </div>
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={isCategoryChannelEnabled(category, 'email')}
                    onCheckedChange={(checked) =>
                      toggleCategoryChannel(category, 'email', !!checked)
                    }
                    disabled={!form.watch('emailEnabled')}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={isCategoryChannelEnabled(category, 'push')}
                    onCheckedChange={(checked) =>
                      toggleCategoryChannel(category, 'push', !!checked)
                    }
                    disabled={!form.watch('pushEnabled')}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={isCategoryChannelEnabled(category, 'platform')}
                    onCheckedChange={(checked) =>
                      toggleCategoryChannel(category, 'platform', !!checked)
                    }
                    disabled={!form.watch('platformEnabled')}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Pause push and email notifications during specific hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quietHoursStart">Start Time</Label>
              <Input
                id="quietHoursStart"
                type="time"
                {...form.register('quietHoursStart')}
                placeholder="22:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quietHoursEnd">End Time</Label>
              <Input
                id="quietHoursEnd"
                type="time"
                {...form.register('quietHoursEnd')}
                placeholder="07:00"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Leave empty to receive notifications 24/7. In-app notifications are not affected by quiet hours.
          </p>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={form.watch('timezone')}
              onValueChange={(value) => form.setValue('timezone', value)}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  )
}
