'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2, Mail, Plug, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  useEmailAccounts,
  useCreateEmailAccount,
  useUpdateEmailAccount,
  useTestEmailConnection,
  useDeleteEmailAccount,
} from '@/hooks/use-email-accounts'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import { buildSignatureHtml } from '@/lib/email/build-signature-html'
import type { CreateEmailAccountDto } from '@tailfire/shared-types/api'

interface EmailFormValues {
  emailAddress: string
  displayName: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  username: string
  password: string
}

export function EmailTab() {
  const { data: accounts, isLoading } = useEmailAccounts()
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()
  const createAccount = useCreateEmailAccount()
  const testConnection = useTestEmailConnection()
  const deleteAccount = useDeleteEmailAccount()
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  const isPhoenixDomain = profile?.email?.endsWith('@phoenixvoyages.ca')

  const form = useForm<EmailFormValues>({
    defaultValues: {
      emailAddress: profile?.email || '',
      displayName: '',
      imapHost: 'mail.phoenixvoyages.ca',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'mail.phoenixvoyages.ca',
      smtpPort: 465,
      smtpTls: true,
      username: profile?.email || '',
      password: '',
    },
  })

  // Pre-fill from profile when it loads
  useEffect(() => {
    if (profile?.email) {
      form.setValue('emailAddress', profile.email)
      form.setValue('username', profile.email)
    }
  }, [profile?.email])

  // Signature state
  const [tagline, setTagline] = useState(profile?.emailSignatureConfig?.tagline || '')
  const [showAvatar, setShowAvatar] = useState(profile?.emailSignatureConfig?.showAvatar ?? false)
  const [isSavingSignature, setIsSavingSignature] = useState(false)

  // Sync signature state when profile loads
  useEffect(() => {
    if (profile) {
      setTagline(profile.emailSignatureConfig?.tagline || '')
      setShowAvatar(profile.emailSignatureConfig?.showAvatar ?? false)
    }
  }, [profile?.emailSignatureConfig?.tagline, profile?.emailSignatureConfig?.showAvatar])

  const updateAccount = useUpdateEmailAccount(editingAccountId || '')

  const onSubmit = async (data: EmailFormValues) => {
    if (editingAccountId) {
      await updateAccount.mutateAsync({
        displayName: data.displayName || undefined,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        imapTls: data.imapTls,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpTls: data.smtpTls,
        username: data.username,
        password: data.password || undefined,
      })
      setEditingAccountId(null)
    } else {
      await createAccount.mutateAsync(data as CreateEmailAccountDto)
      form.reset()
    }
  }

  const handleTestConnection = () => {
    const values = form.getValues()
    testConnection.mutate({
      imapHost: values.imapHost,
      imapPort: values.imapPort,
      imapTls: values.imapTls,
      username: values.username,
      password: values.password,
    })
  }

  const handleEdit = (accountId: string) => {
    const account = accounts?.find((a) => a.id === accountId)
    if (account) {
      setEditingAccountId(accountId)
      form.reset({
        emailAddress: account.emailAddress,
        displayName: account.displayName || '',
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapTls: account.imapTls,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpTls: account.smtpTls,
        username: '',
        password: '',
      })
    }
  }

  const handleUpdateSignature = async () => {
    if (!profile) return
    setIsSavingSignature(true)
    try {
      const signatureHtml = buildSignatureHtml({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        designations: profile.designations,
        jobTitle: profile.jobTitle,
        phoneExtension: profile.phoneExtension,
        avatarUrl: profile.avatarUrl,
        microSiteUrl: undefined,
        companyName: profile.agencyBusinessConfig?.agencyName || '',
        companyPhone: profile.agencyBusinessConfig?.companyPhone,
        companyAddress: profile.agencyBusinessConfig?.companyAddress,
        ticoRegistration: profile.agencyBusinessConfig?.ticoRegistration,
        tagline: tagline || undefined,
        showAvatar,
      })
      await updateProfile.mutateAsync({
        emailSignatureConfig: {
          ...profile.emailSignatureConfig,
          tagline: tagline || undefined,
          showAvatar,
          signatureHtml,
        },
      })
    } finally {
      setIsSavingSignature(false)
    }
  }

  const signaturePreviewHtml = profile
    ? buildSignatureHtml({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        designations: profile.designations,
        jobTitle: profile.jobTitle,
        phoneExtension: profile.phoneExtension,
        avatarUrl: showAvatar ? (profile.avatarUrl ?? undefined) : undefined,
        microSiteUrl: undefined,
        companyName: profile.agencyBusinessConfig?.agencyName || '',
        companyPhone: profile.agencyBusinessConfig?.companyPhone,
        companyAddress: profile.agencyBusinessConfig?.companyAddress,
        ticoRegistration: profile.agencyBusinessConfig?.ticoRegistration,
        tagline: tagline || undefined,
        showAvatar,
      })
    : ''

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const hasAccounts = accounts && accounts.length > 0
  const isSubmitting = createAccount.isPending || updateAccount.isPending

  return (
    <div className="space-y-6">
      {/* Existing accounts */}
      {hasAccounts && !editingAccountId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Accounts
            </CardTitle>
            <CardDescription>Your connected email accounts for sending and receiving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{account.emailAddress}</span>
                    {account.isActive ? (
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {account.displayName && (
                    <p className="text-sm text-muted-foreground">{account.displayName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    IMAP: {account.imapHost}:{account.imapPort} | SMTP: {account.smtpHost}:
                    {account.smtpPort}
                  </p>
                  {account.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last sync: {new Date(account.lastSyncAt).toLocaleString()}
                    </p>
                  )}
                  {account.lastSyncError && (
                    <p className="text-xs text-destructive">
                      {account.lastSyncError === 'IMAP_AUTH_FAILED'
                        ? 'Authentication failed — please update your password'
                        : `Error: ${account.lastSyncError}`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(account.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteAccount.mutate(account.id)}
                    className="text-destructive"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            {editingAccountId ? 'Edit Email Account' : 'Add Email Account'}
          </CardTitle>
          <CardDescription>
            Connect your cPanel email account to send and receive emails from within Tailfire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Email & Display Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emailAddress">Email Address</Label>
                <Input
                  id="emailAddress"
                  type="email"
                  placeholder="you@company.com"
                  disabled={!!editingAccountId || isPhoenixDomain}
                  {...form.register('emailAddress', { required: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="John Smith"
                  {...form.register('displayName')}
                />
              </div>
            </div>

            {/* IMAP Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">IMAP Settings (Incoming)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imapHost">Host</Label>
                  <Input
                    id="imapHost"
                    placeholder="mail.company.com"
                    disabled={isPhoenixDomain}
                    {...form.register('imapHost', { required: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imapPort">Port</Label>
                  <Input
                    id="imapPort"
                    type="number"
                    disabled={isPhoenixDomain}
                    {...form.register('imapPort', { valueAsNumber: true })}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch
                    id="imapTls"
                    checked={form.watch('imapTls')}
                    disabled={isPhoenixDomain}
                    onCheckedChange={(v) => form.setValue('imapTls', v)}
                  />
                  <Label htmlFor="imapTls">TLS/SSL</Label>
                </div>
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">SMTP Settings (Outgoing)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">Host</Label>
                  <Input
                    id="smtpHost"
                    placeholder="mail.company.com"
                    disabled={isPhoenixDomain}
                    {...form.register('smtpHost', { required: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    disabled={isPhoenixDomain}
                    {...form.register('smtpPort', { valueAsNumber: true })}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch
                    id="smtpTls"
                    checked={form.watch('smtpTls')}
                    disabled={isPhoenixDomain}
                    onCheckedChange={(v) => form.setValue('smtpTls', v)}
                  />
                  <Label htmlFor="smtpTls">TLS/SSL</Label>
                </div>
              </div>
            </div>

            {/* Credentials */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Credentials</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="you@company.com"
                    disabled={isPhoenixDomain}
                    {...form.register('username', { required: !editingAccountId })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={editingAccountId ? '••••••••' : ''}
                    {...form.register('password', { required: !editingAccountId })}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingAccountId ? 'Update Account' : 'Add Account'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              {editingAccountId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingAccountId(null)
                    form.reset()
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Email Signature */}
      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            Customize and preview your email signature for client communications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Live preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="rounded-md border bg-white p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: signaturePreviewHtml }}
            />
          </div>

          {/* Avatar toggle */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="showAvatar"
              checked={showAvatar}
              onCheckedChange={(checked) => setShowAvatar(checked === true)}
            />
            <Label htmlFor="showAvatar">Show profile photo in signature</Label>
          </div>

          {/* Tagline */}
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Textarea
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Crafting journeys that matter"
              rows={2}
            />
          </div>

          <Button onClick={handleUpdateSignature} disabled={isSavingSignature}>
            {isSavingSignature && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Signature
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
