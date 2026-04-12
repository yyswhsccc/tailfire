'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, CheckCircle2, Pen } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import {
  useEmailAccounts,
  useCreateEmailAccount,
  useTestEmailConnection,
} from '@/hooks/use-email-accounts'
import { buildSignatureHtml } from '@/lib/email/build-signature-html'

type WizardStep = 'connect' | 'signature' | 'success'

const PHOENIX_MAIL_CONFIG = {
  imapHost: 'mail.phoenixvoyages.ca',
  imapPort: 993,
  imapTls: true,
  smtpHost: 'mail.phoenixvoyages.ca',
  smtpPort: 465,
  smtpTls: true,
}

export function EmailSetupWizard() {
  const [step, setStep] = useState<WizardStep>('connect')
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [password, setPassword] = useState('')
  const [tagline, setTagline] = useState('')
  const [showAvatar, setShowAvatar] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const { data: profile, isLoading: profileLoading } = useMyProfile()
  const { data: existingAccounts } = useEmailAccounts()
  const updateProfile = useUpdateMyProfile()
  const createAccount = useCreateEmailAccount()
  const testConnection = useTestEmailConnection()
  const { toast } = useToast()
  const router = useRouter()

  // Skip to signature step if email account already exists
  useEffect(() => {
    if ((existingAccounts?.length ?? 0) > 0 && step === 'connect') {
      setStep('signature')
    }
  }, [existingAccounts, step])

  const email = profile?.email ?? ''
  const agencyConfig = profile?.agencyBusinessConfig

  const signaturePreviewHtml = useMemo(() => {
    if (!profile) return ''
    return buildSignatureHtml({
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      designations: profile.designations,
      jobTitle: profile.jobTitle,
      phoneExtension: profile.phoneExtension,
      avatarUrl: profile.avatarUrl,
      companyName: agencyConfig?.agencyName ?? 'Phoenix Voyages',
      companyPhone: agencyConfig?.companyPhone,
      companyAddress: agencyConfig?.companyAddress,
      ticoRegistration: agencyConfig?.ticoRegistration,
      tagline: tagline || undefined,
      showAvatar,
    })
  }, [profile, agencyConfig, tagline, showAvatar])

  async function handleTestAndConnect() {
    if (!email) return
    setError(null)
    setIsConnecting(true)

    try {
      // Step 1: Test IMAP connection
      const result = await testConnection.mutateAsync({
        imapHost: PHOENIX_MAIL_CONFIG.imapHost,
        imapPort: PHOENIX_MAIL_CONFIG.imapPort,
        imapTls: PHOENIX_MAIL_CONFIG.imapTls,
        username: email,
        password,
      })

      if (!result.success) {
        setError(result.error || 'Could not connect to the mail server. Check your password.')
        return
      }

      // Step 2: Create the account
      await createAccount.mutateAsync({
        emailAddress: email,
        displayName: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || undefined,
        ...PHOENIX_MAIL_CONFIG,
        username: email,
        password,
      })

      setStep('signature')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
      // If account already exists (duplicate), just proceed to signature
      if (message.includes('duplicate') || message.includes('already exists') || message.includes('unique constraint')) {
        setStep('signature')
        return
      }
      setError(message)
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSaveSignature() {
    setIsSaving(true)
    setError(null)

    try {
      const html = buildSignatureHtml({
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        designations: profile?.designations,
        jobTitle: profile?.jobTitle,
        phoneExtension: profile?.phoneExtension,
        avatarUrl: profile?.avatarUrl,
        companyName: agencyConfig?.agencyName ?? 'Phoenix Voyages',
        companyPhone: agencyConfig?.companyPhone,
        companyAddress: agencyConfig?.companyAddress,
        ticoRegistration: agencyConfig?.ticoRegistration,
        tagline: tagline || undefined,
        showAvatar,
      })

      await updateProfile.mutateAsync({
        emailSignatureConfig: {
          enabled: true,
          signatureHtml: html,
          includeInReplies: true,
          tagline,
          showAvatar,
        },
        platformPreferences: {
          ...profile?.platformPreferences,
          onboardingCompletedAt: new Date().toISOString(),
        },
      })

      toast({
        title: 'Signature saved',
        description: 'Your email signature has been configured.',
      })
      setStep('success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save signature.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Step 1: Connect Email */}
      {step === 'connect' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Mail className="h-4 w-4" />
              Step 1 of 2
            </div>
            <CardTitle>Connect your email</CardTitle>
            <CardDescription>
              We will connect to the Phoenix Voyages mail server so you can send
              and receive emails directly from Tailfire.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                disabled
                value={email}
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                disabled
                value={email}
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your email password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IMAP server</Label>
                <Input
                  disabled
                  value={PHOENIX_MAIL_CONFIG.imapHost}
                  className="bg-muted text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>IMAP port</Label>
                <Input
                  disabled
                  value={`${PHOENIX_MAIL_CONFIG.imapPort} (TLS)`}
                  className="bg-muted text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>SMTP server</Label>
                <Input
                  disabled
                  value={PHOENIX_MAIL_CONFIG.smtpHost}
                  className="bg-muted text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>SMTP port</Label>
                <Input
                  disabled
                  value={`${PHOENIX_MAIL_CONFIG.smtpPort} (TLS)`}
                  className="bg-muted text-xs"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={!password || isConnecting}
              onClick={handleTestAndConnect}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing connection...
                </>
              ) : (
                'Test & Connect'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Signature */}
      {step === 'signature' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Pen className="h-4 w-4" />
              Step 2 of 2
            </div>
            <CardTitle>Set up your signature</CardTitle>
            <CardDescription>
              Your signature will be appended to every email you send from
              Tailfire. Customize it below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Textarea
                id="tagline"
                placeholder='e.g. "Your dream vacation is just a call away"'
                rows={2}
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showAvatar"
                checked={showAvatar}
                onCheckedChange={(checked) =>
                  setShowAvatar(checked === true)
                }
              />
              <Label htmlFor="showAvatar" className="cursor-pointer">
                Include my photo in the signature
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="rounded-md border bg-white p-4"
                dangerouslySetInnerHTML={{ __html: signaturePreviewHtml }}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={isSaving}
              onClick={handleSaveSignature}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save & Continue'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Success */}
      {step === 'success' && (
        <Card>
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-2" />
            <CardTitle>You're all set!</CardTitle>
            <CardDescription>
              Your email is connected and your signature is ready. You can
              change these settings anytime from your profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => router.push('/profile')}
            >
              Next: Complete your profile
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
