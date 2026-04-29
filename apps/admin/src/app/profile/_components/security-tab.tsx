'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { Loader2, ShieldCheck, Clock, LogOut, AlertCircle, Copy, Check, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/providers/auth-provider'
import { useMyProfile } from '@/hooks/use-user-profile'
import { createClient } from '@/lib/supabase/client'
import { useMfa } from '@/hooks/use-mfa'

interface PasswordFormData {
  newPassword: string
  confirmPassword: string
}

export function SecurityTab() {
  const { toast } = useToast()
  const { user, signOut } = useAuth()
  const { data: profile } = useMyProfile()
  const [isUpdating, setIsUpdating] = useState(false)
  const [showReauthError, setShowReauthError] = useState(false)

  const form = useForm<PasswordFormData>({
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (data: PasswordFormData) => {
    // Validate passwords match
    if (data.newPassword !== data.confirmPassword) {
      form.setError('confirmPassword', {
        type: 'manual',
        message: 'Passwords do not match',
      })
      return
    }

    // Validate minimum password length
    if (data.newPassword.length < 8) {
      form.setError('newPassword', {
        type: 'manual',
        message: 'Password must be at least 8 characters',
      })
      return
    }

    setIsUpdating(true)
    setShowReauthError(false)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      })

      if (error) {
        // Check for reauthentication or session-related errors
        const isReauthError =
          error.message.toLowerCase().includes('reauthentication') ||
          error.message.toLowerCase().includes('session') ||
          error.code === 'session_expired' ||
          error.name === 'AuthSessionMissingError' ||
          error.message.toLowerCase().includes('auth session missing')

        if (isReauthError) {
          setShowReauthError(true)
        } else {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update password. Please try again.',
            variant: 'destructive',
          })
        }
        return
      }

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      })
      form.reset()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/auth/login'
  }

  // Format last login date
  const formatLastLogin = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Account Security
          </CardTitle>
          <CardDescription>Manage your account security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Email Address</p>
              <p className="text-sm text-muted-foreground">{user?.email || 'Not set'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Last Login</p>
                <p className="text-sm text-muted-foreground">
                  {formatLastLogin(profile?.lastLoginAt ?? null)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reauth Error Alert */}
      {showReauthError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Session Expired</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              For security reasons, please sign out and sign back in before changing your password.
            </p>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="w-fit">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...form.register('newPassword')}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              {form.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...form.register('confirmPassword')}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isUpdating}>
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <MfaSection />
    </div>
  )
}

// ============================================================================
// MFA Section Component
// ============================================================================

function MfaSection() {
  const { toast } = useToast()
  const {
    isEnrolled,
    factors,
    isLoading: mfaLoading,
    refreshState,
    enroll,
    verify,
    unenroll,
  } = useMfa()

  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    refreshState()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnroll = async () => {
    setEnrolling(true)
    setError('')
    const result = await enroll('Tailfire')
    if (!result) {
      setError('Failed to start 2FA setup. Please try again.')
      setEnrolling(false)
      return
    }
    setFactorId(result.factorId)
    setQrCode(result.qrCode)
    setSecret(result.secret)
  }

  const handleVerify = async () => {
    if (code.length !== 6) return
    setVerifying(true)
    setError('')
    try {
      const success = await verify(factorId, code)
      if (success) {
        toast({ title: 'Two-factor authentication enabled' })
        // State reset may not execute if auth state change re-renders the tree
        setEnrolling(false)
        setQrCode('')
        setSecret('')
        setCode('')
      } else {
        setError('Invalid code. Please try again.')
        setCode('')
      }
    } catch (err) {
      console.error('[MFA] Verify error:', err)
      setError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleRemove = async () => {
    if (!factors[0]) return
    setRemoving(true)
    const success = await unenroll(factors[0].id)
    if (success) {
      toast({ title: 'Two-factor authentication removed' })
    } else {
      toast({ title: 'Failed to remove 2FA', variant: 'destructive' })
    }
    setRemoving(false)
  }

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret)
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2000)
  }

  if (mfaLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const handleChangeDevice = async () => {
    if (!factors[0]) return
    setEnrolling(true)
    setError('')
    const success = await unenroll(factors[0].id)
    if (!success) {
      setEnrolling(false)
      toast({ title: 'Failed to remove existing factor', variant: 'destructive' })
      return
    }
    // Start new enrollment immediately
    const result = await enroll('Tailfire')
    if (!result) {
      setEnrolling(false)
      setError('Failed to start 2FA setup. Please try again.')
      return
    }
    setFactorId(result.factorId)
    setQrCode(result.qrCode)
    setSecret(result.secret)
  }

  // Enrolled state — show status + change device / remove options
  if (isEnrolled && !enrolling) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>Your account is protected with TOTP authentication</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4">
            <div>
              <p className="font-medium text-green-800">2FA is enabled</p>
              <p className="text-sm text-green-600">
                Authenticator app: {factors[0]?.friendly_name || 'Tailfire'}
              </p>
            </div>
            <ShieldCheck className="h-8 w-8 text-green-500" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleChangeDevice}
              disabled={removing}
            >
              {removing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing...</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" /> Change Device</>
              )}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" /> Remove 2FA</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Enrollment flow
  if (enrolling && qrCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>Scan the QR code with your authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="rounded-lg border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="Scan this QR code" width={200} height={200} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Manual entry code:</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted px-3 py-2 text-xs font-mono break-all">
                {secret}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopySecret}>
                {secretCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Enter 6-digit code from your app:</Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              autoComplete="one-time-code"
              className="text-center text-xl tracking-widest"
            />
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setEnrolling(false); setQrCode(''); setSecret(''); setCode('') }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              onClick={handleVerify}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
              ) : (
                'Verify & Enable'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Not enrolled — show setup button
  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>Add an extra layer of security to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <p className="text-sm">
            Protect your account with a TOTP authenticator app like Google Authenticator, Authy, or 1Password.
          </p>
          <p className="text-sm text-muted-foreground">
            You&apos;ll be asked for a code each time you sign in.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="bg-orange-600 hover:bg-orange-700"
          onClick={handleEnroll}
          disabled={enrolling}
        >
          {enrolling ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up...</>
          ) : (
            <><ShieldCheck className="mr-2 h-4 w-4" /> Enable Two-Factor Authentication</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
