'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useMyProfile,
  useUpdateMyProfile,
  useUploadAvatar,
  useDeleteAvatar,
  useMyAdvisorProfile,
} from '@/hooks/use-user-profile'

const OTA_URL = process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'
import { UserAvatar } from '@/components/user/user-avatar'
import { AvatarCropDialog } from './avatar-crop-dialog'
import { useProfileForm } from './profile-form-context'
import type { UpdateUserProfileDto } from '@tailfire/shared-types/api'

interface PublicProfileFormData {
  firstName: string
  lastName: string
  bio: string
  publicPhone: string
  officeAddress: {
    addressLine1: string
    addressLine2: string
    city: string
    province: string
    postalCode: string
    country: string
  }
  socialMediaLinks: {
    linkedin: string
    instagram: string
    facebook: string
    twitter: string
    website: string
  }
  isPublicProfile: boolean
}

export function PublicProfileTab() {
  const { toast } = useToast()
  const { data: profile, isLoading } = useMyProfile()
  const { data: advisorProfile } = useMyAdvisorProfile()
  const updateProfile = useUpdateMyProfile()
  const uploadAvatar = useUploadAvatar()
  const deleteAvatar = useDeleteAvatar()
  const { registerForm, unregisterForm, notifyPendingChange, isSubmitting } = useProfileForm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [cropDialogOpen, setCropDialogOpen] = useState(false)

  const form = useForm<PublicProfileFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      bio: '',
      publicPhone: '',
      officeAddress: {
        addressLine1: '',
        addressLine2: '',
        city: '',
        province: '',
        postalCode: '',
        country: 'Canada',
      },
      socialMediaLinks: {
        linkedin: '',
        instagram: '',
        facebook: '',
        twitter: '',
        website: '',
      },
      isPublicProfile: false,
    },
  })

  // Reset form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        bio: profile.bio || '',
        publicPhone: profile.publicPhone || '',
        officeAddress: {
          addressLine1: profile.officeAddress?.addressLine1 || '',
          addressLine2: profile.officeAddress?.addressLine2 || '',
          city: profile.officeAddress?.city || '',
          province: profile.officeAddress?.province || '',
          postalCode: profile.officeAddress?.postalCode || '',
          country: profile.officeAddress?.country || 'Canada',
        },
        socialMediaLinks: {
          linkedin: profile.socialMediaLinks?.linkedin || '',
          instagram: profile.socialMediaLinks?.instagram || '',
          facebook: profile.socialMediaLinks?.facebook || '',
          twitter: profile.socialMediaLinks?.twitter || '',
          website: profile.socialMediaLinks?.website || '',
        },
        isPublicProfile: profile.isPublicProfile || false,
      })
    }
  }, [profile, form])

  const onSubmit = useCallback(async (data: PublicProfileFormData) => {
    try {
      // Determine if nested objects have any content
      const hasOfficeAddress = Object.values(data.officeAddress).some(v => v)
      const hasSocialLinks = Object.values(data.socialMediaLinks).some(v => v)

      // Build update payload - send null/{} to clear, or the data to update
      const updateData: UpdateUserProfileDto = {
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        bio: data.bio || undefined,
        publicPhone: data.publicPhone || undefined,
        // Send null to clear officeAddress, or the data to update
        officeAddress: hasOfficeAddress ? data.officeAddress : null,
        // Send empty object to clear socialMediaLinks, or the data to update
        socialMediaLinks: hasSocialLinks ? data.socialMediaLinks : {},
        isPublicProfile: data.isPublicProfile,
      }

      await updateProfile.mutateAsync(updateData)
      toast({
        title: 'Profile updated',
        description: 'Your public profile has been saved.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
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
    registerForm('public', {
      submit: handleFormSubmit,
      isPending: updateProfile.isPending,
    })
    return () => unregisterForm('public')
  }, [registerForm, unregisterForm, handleFormSubmit, updateProfile.isPending])

  // Notify context when pending state changes so Save button updates
  useEffect(() => {
    notifyPendingChange()
  }, [updateProfile.isPending, notifyPendingChange])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        variant: 'destructive',
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        variant: 'destructive',
      })
      return
    }

    // Open crop dialog with selected file
    setSelectedFile(file)
    setCropDialogOpen(true)

    // Reset file input for future selections
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = async (croppedBlob: Blob, fileName: string, mimeType: string) => {
    try {
      setIsUploading(true)
      // Create a File object from the cropped blob
      const croppedFile = new File([croppedBlob], fileName, { type: mimeType })
      await uploadAvatar.mutateAsync(croppedFile)
      toast({
        title: 'Avatar uploaded',
        description: 'Your profile picture has been updated.',
      })
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'Failed to upload avatar. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      setSelectedFile(null)
    }
  }

  const handleCropDialogClose = (open: boolean) => {
    setCropDialogOpen(open)
    if (!open) {
      setSelectedFile(null)
    }
  }

  const handleAvatarDelete = async () => {
    try {
      await deleteAvatar.mutateAsync()
      toast({
        title: 'Avatar removed',
        description: 'Your profile picture has been removed.',
      })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Failed to remove avatar. Please try again.',
        variant: 'destructive',
      })
    }
  }

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
      {/* Avatar Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>
            Upload a profile picture that will be visible to travelers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <UserAvatar
                firstName={profile?.firstName}
                lastName={profile?.lastName}
                avatarUrl={profile?.avatarUrl}
                size="xl"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Camera className="mr-2 h-4 w-4" />
                Upload Photo
              </Button>
              {profile?.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAvatarDelete}
                  disabled={deleteAvatar.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Your name and bio as shown to travelers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                {...form.register('firstName')}
                placeholder="Enter your first name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                {...form.register('lastName')}
                placeholder="Enter your last name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              {...form.register('bio')}
              placeholder="Tell travelers about yourself and your expertise..."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="publicPhone">Public Phone Number</Label>
            <Input
              id="publicPhone"
              {...form.register('publicPhone')}
              placeholder="+1 (555) 123-4567"
            />
            <p className="text-xs text-muted-foreground">
              This number will be visible to travelers on your public profile
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Office Address */}
      <Card>
        <CardHeader>
          <CardTitle>Office Address</CardTitle>
          <CardDescription>Your business address for traveler inquiries</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              {...form.register('officeAddress.addressLine1')}
              placeholder="Street address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressLine2">Address Line 2</Label>
            <Input
              id="addressLine2"
              {...form.register('officeAddress.addressLine2')}
              placeholder="Suite, unit, building, floor, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                {...form.register('officeAddress.city')}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Input
                id="province"
                {...form.register('officeAddress.province')}
                placeholder="Province"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                {...form.register('officeAddress.postalCode')}
                placeholder="A1A 1A1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                {...form.register('officeAddress.country')}
                placeholder="Canada"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Media */}
      <Card>
        <CardHeader>
          <CardTitle>Social Media</CardTitle>
          <CardDescription>Connect your social profiles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              {...form.register('socialMediaLinks.website')}
              placeholder="https://yourwebsite.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                {...form.register('socialMediaLinks.linkedin')}
                placeholder="https://linkedin.com/in/username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                {...form.register('socialMediaLinks.facebook')}
                placeholder="https://facebook.com/username"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                {...form.register('socialMediaLinks.instagram')}
                placeholder="https://instagram.com/username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter">Twitter / X</Label>
              <Input
                id="twitter"
                {...form.register('socialMediaLinks.twitter')}
                placeholder="https://twitter.com/username"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Public Profile Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Visibility</CardTitle>
          <CardDescription>
            Control whether your profile is visible to travelers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isPublicProfile">Make my profile visible to travelers</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, your public profile (name, bio, photo, contact info) will be
                visible on the traveler-facing website.
              </p>
            </div>
            <Switch
              id="isPublicProfile"
              checked={form.watch('isPublicProfile')}
              onCheckedChange={(checked) => form.setValue('isPublicProfile', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* My Storefront URL */}
      {advisorProfile && (
        <Card className="border-[#C59746]/20 bg-[#C59746]/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              My Storefront
            </CardTitle>
            <CardDescription>
              Share this link with clients and prospects. All visitors who use this link will be attributed to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${OTA_URL}/advisor/${advisorProfile.slug}`}
                className="font-mono text-sm"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${OTA_URL}/advisor/${advisorProfile.slug}`)
                  toast({ title: 'Copied!', description: 'Storefront URL copied to clipboard' })
                }}
              >
                Copy
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <a
                href={`${OTA_URL}/advisor/${advisorProfile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C59746] hover:underline"
              >
                Preview storefront →
              </a>
              <span>·</span>
              <span>Referral code: <code className="rounded bg-muted px-1">{advisorProfile.slug}</code></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>

      {/* Avatar Crop Dialog */}
      <AvatarCropDialog
        file={selectedFile}
        open={cropDialogOpen}
        onOpenChange={handleCropDialogClose}
        onCropComplete={handleCropComplete}
      />
    </form>
  )
}
