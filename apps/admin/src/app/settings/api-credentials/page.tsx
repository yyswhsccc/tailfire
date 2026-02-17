'use client'

import { useState } from 'react'
import { Plus, AlertCircle, Cloud, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  useApiCredentials,
  useDeleteCredential,
  useRollbackCredential,
  useTestConnection,
  useProviderMetadata,
  type ProviderMetadata,
} from '@/hooks/use-api-credentials'
import { CredentialsTable, TestResult } from './_components/credentials-table'
import { CredentialFormDialog } from './_components/credential-form-dialog'
import { RevealCredentialsDialog } from './_components/reveal-credentials-dialog'
import { RotateCredentialsDialog } from './_components/rotate-credentials-dialog'
import { VersionHistoryDialog } from './_components/version-history-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// Component to show status of Doppler-managed providers
function ProviderStatusRow({ provider }: { provider: ProviderMetadata }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {provider.isAvailable ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
        </div>
        <div>
          <div className="font-medium text-sm">{provider.displayName}</div>
          <div className="text-xs text-muted-foreground">{provider.description}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {provider.isShared && (
          <Badge variant="outline" className="text-xs">
            Shared
          </Badge>
        )}
        <Badge variant={provider.isAvailable ? 'default' : 'secondary'} className="text-xs">
          {provider.isAvailable ? 'Configured' : 'Not Configured'}
        </Badge>
      </div>
    </div>
  )
}

export default function ApiCredentialsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [revealCredentialId, setRevealCredentialId] = useState<string | null>(null)
  const [revealCredentialName, setRevealCredentialName] = useState('')
  const [rotateCredentialId, setRotateCredentialId] = useState<string | null>(null)
  const [rotateCredentialName, setRotateCredentialName] = useState('')
  const [historyCredentialId, setHistoryCredentialId] = useState<string | null>(null)
  const [historyCredentialName, setHistoryCredentialName] = useState('')
  const [deleteCredentialId, setDeleteCredentialId] = useState<string | null>(null)
  const [rollbackCredentialId, setRollbackCredentialId] = useState<string | null>(null)

  // Test connection state tracking
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())

  const { data: credentials, isLoading, error } = useApiCredentials()
  const { data: providerMetadata, isLoading: isLoadingProviders } = useProviderMetadata()
  const deleteCredential = useDeleteCredential()
  const rollbackCredential = useRollbackCredential()
  const testConnection = useTestConnection()
  const { toast } = useToast()

  // Get Doppler-managed providers (env-only) for the status display
  const dopplerManagedProviders = providerMetadata?.filter(p => p.sourcePolicy === 'env-only') ?? []

  const handleReveal = (id: string) => {
    const credential = credentials?.find(c => c.id === id)
    if (credential) {
      setRevealCredentialId(id)
      setRevealCredentialName(credential.name)
    }
  }

  const handleRotate = (id: string) => {
    const credential = credentials?.find(c => c.id === id)
    if (credential) {
      setRotateCredentialId(id)
      setRotateCredentialName(credential.name)
    }
  }

  const handleRollback = (id: string) => {
    setRollbackCredentialId(id)
  }

  const confirmRollback = async () => {
    if (!rollbackCredentialId) return

    try {
      await rollbackCredential.mutateAsync(rollbackCredentialId)
      toast({
        title: 'Rollback successful',
        description: 'The credential has been rolled back to the previous version.',
      })
      setRollbackCredentialId(null)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to rollback credential. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleViewHistory = (id: string) => {
    const credential = credentials?.find(c => c.id === id)
    if (credential) {
      setHistoryCredentialId(id)
      setHistoryCredentialName(credential.name)
    }
  }

  const handleDelete = (id: string) => {
    setDeleteCredentialId(id)
  }

  const handleTestConnection = async (id: string) => {
    const credential = credentials?.find(c => c.id === id)
    if (!credential) return

    // Set testing state
    setTestingIds(prev => new Set(prev).add(id))

    try {
      const result = await testConnection.mutateAsync(id)

      // Store test result
      const testResult: TestResult = {
        success: result.success,
        message: result.message || (result.success ? 'Connection OK' : 'Connection failed'),
        testedAt: new Date().toISOString(),
      }
      setTestResults(prev => ({ ...prev, [id]: testResult }))

      if (result.success) {
        toast({
          title: 'Connection successful',
          description: result.message || `Successfully connected to ${credential.name}`,
        })
      } else {
        toast({
          title: 'Connection failed',
          description: result.error || result.message || 'Failed to connect to the provider',
          variant: 'destructive',
        })
      }
    } catch (error) {
      // Store failed result
      const testResult: TestResult = {
        success: false,
        message: 'Connection test failed unexpectedly',
        testedAt: new Date().toISOString(),
      }
      setTestResults(prev => ({ ...prev, [id]: testResult }))

      toast({
        title: 'Connection test error',
        description: 'An error occurred while testing the connection. Please try again.',
        variant: 'destructive',
      })
    } finally {
      // Clear testing state
      setTestingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const confirmDelete = async () => {
    if (!deleteCredentialId) return

    try {
      await deleteCredential.mutateAsync(deleteCredentialId)
      toast({
        title: 'Credential revoked',
        description: 'The API credential has been successfully revoked.',
      })
      setDeleteCredentialId(null)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to revoke credential. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <SettingsTabsLayout activeTab="api-credentials">
      {/* Page-specific header with action */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold">API Credentials</h3>
          <p className="text-sm text-muted-foreground">
            Manage encrypted API credentials for third-party service integrations
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Credential
        </Button>
      </div>

      <div className="space-y-6">
        {/* Doppler-Managed Providers Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Doppler-Managed Credentials
            </CardTitle>
            <CardDescription>
              These API credentials are managed via Doppler and loaded from environment variables.
              They are shared across all environments (dev, preview, prod).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingProviders ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded" />
                ))}
              </div>
            ) : dopplerManagedProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Doppler-managed providers configured.</p>
            ) : (
              <div className="space-y-3">
                {dopplerManagedProviders.map((provider) => (
                  <ProviderStatusRow key={provider.provider} provider={provider} />
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                To update these credentials, modify them in{' '}
                <a
                  href="https://dashboard.doppler.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Doppler Dashboard
                  <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and redeploy the API.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Notice</CardTitle>
            <CardDescription>
              Database-stored credentials are encrypted using AES-256-GCM. Doppler-managed credentials
              use Doppler's encryption and are injected as environment variables at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Recommended:</strong> All third-party API credentials should be managed via Doppler
              for centralized secret management and easier rotation.
            </p>
          </CardContent>
        </Card>

        <div className="bg-white border border-ash-200 rounded-lg">
          {error ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive mb-4">
                Failed to load API credentials. Please try again.
              </p>
            </div>
          ) : isLoading ? (
            <TableSkeleton rows={3} />
          ) : !credentials || credentials.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-ash-500 mb-4">
                No API credentials configured
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Credential
              </Button>
            </div>
          ) : (
            <CredentialsTable
              credentials={credentials}
              testResults={testResults}
              testingIds={testingIds}
              onReveal={handleReveal}
              onRotate={handleRotate}
              onRollback={handleRollback}
              onViewHistory={handleViewHistory}
              onDelete={handleDelete}
              onTestConnection={handleTestConnection}
            />
          )}
        </div>
      </div>

      <CredentialFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <RevealCredentialsDialog
        credentialId={revealCredentialId}
        credentialName={revealCredentialName}
        open={!!revealCredentialId}
        onOpenChange={(open) => !open && setRevealCredentialId(null)}
      />

      <RotateCredentialsDialog
        credentialId={rotateCredentialId}
        credentialName={rotateCredentialName}
        open={!!rotateCredentialId}
        onOpenChange={(open) => !open && setRotateCredentialId(null)}
      />

      <VersionHistoryDialog
        credentialId={historyCredentialId}
        credentialName={historyCredentialName}
        open={!!historyCredentialId}
        onOpenChange={(open) => !open && setHistoryCredentialId(null)}
      />

      <AlertDialog open={!!deleteCredentialId} onOpenChange={(open) => !open && setDeleteCredentialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Credential</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this credential? This will mark it as revoked and
              it will no longer be available for use. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rollbackCredentialId} onOpenChange={(open) => !open && setRollbackCredentialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback Credential</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to rollback to the previous version? This will reactivate the
              previous version and deactivate the current one. Services will need to be restarted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRollback}>
              Confirm Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsTabsLayout>
  )
}
