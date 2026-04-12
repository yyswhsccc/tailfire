'use client'

import { useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import { useProfileForm } from './profile-form-context'
import type { UpdateUserProfileDto } from '@tailfire/shared-types/api'

interface PreferencesFormData {
  theme: 'light' | 'dark' | 'system'
  timezone: string
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
}

const COMMON_TIMEZONES = [
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  { value: 'America/Winnipeg', label: 'Central Time (Winnipeg)' },
  { value: 'America/Edmonton', label: 'Mountain Time (Edmonton)' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
  { value: 'America/Halifax', label: 'Atlantic Time (Halifax)' },
  { value: 'America/St_Johns', label: 'Newfoundland Time (St. Johns)' },
  { value: 'UTC', label: 'UTC' },
]

export function PreferencesTab() {
  const { toast } = useToast()
  const { data: profile, isLoading } = useMyProfile()
  const updateProfile = useUpdateMyProfile()
  const { registerForm, unregisterForm, notifyPendingChange, isSubmitting } = useProfileForm()

  const form = useForm<PreferencesFormData>({
    defaultValues: {
      theme: 'system',
      timezone: 'America/Toronto',
      dateFormat: 'MM/DD/YYYY',
    },
  })

  // Reset form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        theme: profile.platformPreferences?.theme || 'system',
        timezone: profile.platformPreferences?.timezone || 'America/Toronto',
        dateFormat: profile.platformPreferences?.dateFormat || 'MM/DD/YYYY',
      })
    }
  }, [profile, form])

  const onSubmit = useCallback(async (data: PreferencesFormData) => {
    try {
      const updateData: UpdateUserProfileDto = {
        platformPreferences: {
          theme: data.theme,
          timezone: data.timezone,
          dateFormat: data.dateFormat,
        },
      }

      await updateProfile.mutateAsync(updateData)
      toast({
        title: 'Preferences updated',
        description: 'Your preferences have been saved.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update preferences. Please try again.',
        variant: 'destructive',
      })
    }
  }, [updateProfile, toast])

  // Stable submit function for form registry
  const handleFormSubmit = useCallback(async () => {
    await form.handleSubmit(onSubmit)()
  }, [form, onSubmit])

  // Register form with context for top Save button (ref-based, no re-render on registration)
  useEffect(() => {
    registerForm('preferences', {
      submit: handleFormSubmit,
      isPending: updateProfile.isPending,
    })
    return () => unregisterForm('preferences')
  }, [registerForm, unregisterForm, handleFormSubmit, updateProfile.isPending])

  // Notify context when pending state changes so Save button updates
  useEffect(() => {
    notifyPendingChange()
  }, [updateProfile.isPending, notifyPendingChange])

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
      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
          <CardDescription>Customize how the application looks and feels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={form.watch('theme')}
              onValueChange={(value: 'light' | 'dark' | 'system') =>
                form.setValue('theme', value)
              }
            >
              <SelectTrigger id="theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Regional Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>Configure timezone and date formatting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
          <div className="space-y-2">
            <Label htmlFor="dateFormat">Date Format</Label>
            <Select
              value={form.watch('dateFormat')}
              onValueChange={(value: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD') =>
                form.setValue('dateFormat', value)
              }
            >
              <SelectTrigger id="dateFormat">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US)</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (UK/EU)</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Email Signature */}
      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            Email signature is now managed in the Email tab
          </CardDescription>
        </CardHeader>
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
