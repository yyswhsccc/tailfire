'use client'

import { useCallback, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { useUser } from '@/hooks/use-user'
import { useProfileForm } from './profile-form-context'
import type { UpdateUserProfileDto } from '@tailfire/shared-types/api'

interface AgentInfoFormData {
  emergencyContactName: string
  emergencyContactPhone: string
  licensingInfo: {
    ticoNumber: string
    hstNumber: string
    tlnAgentProfileUrl: string
  }
  commissionSettings: {
    defaultRate: string
    splitType: 'fixed' | 'percentage' | 'system_controlled' | ''
    splitValue: string
  }
}

export function AgentInfoTab() {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const { data: profile, isLoading } = useMyProfile()
  const updateProfile = useUpdateMyProfile()
  const { registerForm, unregisterForm, notifyPendingChange, isSubmitting } = useProfileForm()

  const form = useForm<AgentInfoFormData>({
    defaultValues: {
      emergencyContactName: '',
      emergencyContactPhone: '',
      licensingInfo: {
        ticoNumber: '',
        hstNumber: '',
        tlnAgentProfileUrl: '',
      },
      commissionSettings: {
        defaultRate: '',
        splitType: '',
        splitValue: '',
      },
    },
  })

  // Reset form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        emergencyContactName: profile.emergencyContactName || '',
        emergencyContactPhone: profile.emergencyContactPhone || '',
        licensingInfo: {
          ticoNumber: profile.licensingInfo?.ticoNumber || '',
          hstNumber: profile.licensingInfo?.hstNumber || '',
          tlnAgentProfileUrl: profile.licensingInfo?.tlnAgentProfileUrl || '',
        },
        commissionSettings: {
          defaultRate: profile.commissionSettings?.defaultRate?.toString() || '',
          splitType: profile.commissionSettings?.splitType || '',
          splitValue: profile.commissionSettings?.splitValue?.toString() || '',
        },
      })
    }
  }, [profile, form])

  const onSubmit = useCallback(async (data: AgentInfoFormData) => {
    try {
      // Build licensing info - only include non-empty fields
      const hasLicensingInfo = Object.values(data.licensingInfo).some((v) => v)
      const licensingInfo = hasLicensingInfo
        ? {
            ticoNumber: data.licensingInfo.ticoNumber || undefined,
            hstNumber: data.licensingInfo.hstNumber || undefined,
            tlnAgentProfileUrl: data.licensingInfo.tlnAgentProfileUrl || undefined,
          }
        : undefined

      // Build commission settings - only include non-empty fields
      // When splitType is 'system_controlled', omit splitValue as it's managed by the system
      const isSystemControlled = data.commissionSettings.splitType === 'system_controlled'
      const hasCommissionSettings =
        data.commissionSettings.defaultRate ||
        data.commissionSettings.splitType ||
        (!isSystemControlled && data.commissionSettings.splitValue)
      const commissionSettings = hasCommissionSettings
        ? {
            defaultRate: data.commissionSettings.defaultRate
              ? parseFloat(data.commissionSettings.defaultRate)
              : undefined,
            splitType: data.commissionSettings.splitType || undefined,
            // Omit splitValue when system controlled
            splitValue: isSystemControlled
              ? undefined
              : data.commissionSettings.splitValue
                ? parseFloat(data.commissionSettings.splitValue)
                : undefined,
          }
        : undefined

      const updateData: UpdateUserProfileDto = {
        emergencyContactName: data.emergencyContactName || undefined,
        emergencyContactPhone: data.emergencyContactPhone || undefined,
        licensingInfo,
        // Only admins can update commission settings
        ...(isAdmin ? { commissionSettings } : {}),
      }

      await updateProfile.mutateAsync(updateData)
      toast({
        title: 'Agent info updated',
        description: 'Your agent information has been saved.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update agent info. Please try again.',
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
    registerForm('agent', {
      submit: handleFormSubmit,
      isPending: updateProfile.isPending,
    })
    return () => unregisterForm('agent')
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
      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Emergency Contact</CardTitle>
          <CardDescription>
            Contact information for emergencies while traveling with clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emergencyContactName">Contact Name</Label>
            <Input
              id="emergencyContactName"
              {...form.register('emergencyContactName')}
              placeholder="Enter emergency contact name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
            <Input
              id="emergencyContactPhone"
              {...form.register('emergencyContactPhone')}
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </CardContent>
      </Card>

      {/* TICO & Licensing */}
      <Card>
        <CardHeader>
          <CardTitle>TICO & Licensing</CardTitle>
          <CardDescription>Travel industry certifications and licensing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticoNumber">TICO Registration Number</Label>
              <Input
                id="ticoNumber"
                {...form.register('licensingInfo.ticoNumber')}
                placeholder="Enter TICO number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hstNumber">HST Number</Label>
              <Input
                id="hstNumber"
                {...form.register('licensingInfo.hstNumber')}
                placeholder="Enter HST number"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tlnAgentProfileUrl">TLN Agent Profile URL</Label>
            <Input
              id="tlnAgentProfileUrl"
              {...form.register('licensingInfo.tlnAgentProfileUrl')}
              placeholder="https://travelleadersnetwork.com/agent/..."
            />
            <p className="text-xs text-muted-foreground">
              Your Travel Leaders Network agent profile page URL
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Commission Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Settings</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Default commission rates and split configurations'
              : 'Commission settings are managed by your agency administrator'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultRate">Default Commission Rate (%)</Label>
            <Input
              id="defaultRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              {...form.register('commissionSettings.defaultRate')}
              placeholder="10"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Your standard commission percentage for bookings
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="splitType">Commission Split Type</Label>
              <Controller
                name="commissionSettings.splitType"
                control={form.control}
                render={({ field }) => (
                  <Select
                    key={`splitType-${field.value}`}
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select split type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system_controlled">System Controlled</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="splitValue">
                Split Value {form.watch('commissionSettings.splitType') === 'percentage' ? '(%)' : '($)'}
              </Label>
              <Input
                id="splitValue"
                type="number"
                min="0"
                max={form.watch('commissionSettings.splitType') === 'percentage' ? '100' : undefined}
                step="0.01"
                {...form.register('commissionSettings.splitValue')}
                placeholder={form.watch('commissionSettings.splitType') === 'percentage' ? '50' : '100'}
                disabled={!isAdmin || form.watch('commissionSettings.splitType') === 'system_controlled'}
              />
              {form.watch('commissionSettings.splitType') === 'system_controlled' && (
                <p className="text-xs text-muted-foreground">Split value is managed by the system</p>
              )}
            </div>
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground text-amber-500">
              Contact your administrator to change commission settings
            </p>
          )}
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
