'use client'

import { MoreVertical, Eye, RotateCw, History, Trash2, Zap, CheckCircle2, XCircle, Circle, Loader2 } from 'lucide-react'
import { CredentialMetadataDto, ApiProvider, CredentialStatus } from '@tailfire/shared-types/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Test result status for a credential
 */
export interface TestResult {
  success: boolean
  message: string
  testedAt: string
}

interface CredentialsTableProps {
  credentials: CredentialMetadataDto[]
  testResults: Record<string, TestResult>
  testingIds: Set<string>
  onReveal: (id: string) => void
  onRotate: (id: string) => void
  onRollback: (id: string) => void
  onViewHistory: (id: string) => void
  onDelete: (id: string) => void
  onTestConnection: (id: string) => void
}

function getProviderLabel(provider: ApiProvider): string {
  switch (provider) {
    case ApiProvider.SUPABASE_STORAGE:
      return 'Supabase Storage'
    case ApiProvider.CLOUDFLARE_R2:
      return 'Cloudflare R2'
    case ApiProvider.BACKBLAZE_B2:
      return 'Backblaze B2'
    case ApiProvider.UNSPLASH:
      return 'Unsplash'
    case ApiProvider.AERODATABOX:
      return 'Aerodatabox (Flights)'
    case ApiProvider.AMADEUS:
      return 'Amadeus'
    default:
      return provider
  }
}

function getStatusBadge(status: CredentialStatus, isActive: boolean) {
  if (!isActive) {
    return <Badge variant="secondary">Inactive</Badge>
  }

  switch (status) {
    case CredentialStatus.ACTIVE:
      return <Badge variant="default" className="bg-green-600">Active</Badge>
    case CredentialStatus.EXPIRED:
      return <Badge variant="destructive">Expired</Badge>
    case CredentialStatus.REVOKED:
      return <Badge variant="secondary">Revoked</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

/**
 * Get test status indicator component
 */
function TestStatusIndicator({
  testResult,
  isTesting,
}: {
  testResult?: TestResult
  isTesting: boolean
}) {
  if (isTesting) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
        </TooltipTrigger>
        <TooltipContent>
          <p>Testing connection...</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (!testResult) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Circle className="h-4 w-4 text-gray-300" />
        </TooltipTrigger>
        <TooltipContent>
          <p>Not tested yet</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (testResult.success) {
    const testedAt = new Date(testResult.testedAt)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Connection OK</p>
          <p className="text-xs text-muted-foreground">
            Tested {testedAt.toLocaleTimeString()}
          </p>
        </TooltipContent>
      </Tooltip>
    )
  }

  const testedAt = new Date(testResult.testedAt)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <XCircle className="h-4 w-4 text-red-500" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium text-red-600">Connection Failed</p>
        <p className="text-xs max-w-[200px]">{testResult.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Tested {testedAt.toLocaleTimeString()}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

export function CredentialsTable({
  credentials,
  testResults,
  testingIds,
  onReveal,
  onRotate,
  onRollback,
  onViewHistory,
  onDelete,
  onTestConnection,
}: CredentialsTableProps) {
  return (
    <TooltipProvider>
      <div className="w-full">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ash-200 bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-ash-600 uppercase tracking-wider">
                Connection
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Last Rotated
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider">
                Expires
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-ash-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-ash-200">
            {credentials.map((credential) => (
              <tr
                key={credential.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {credential.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-700">
                    {getProviderLabel(credential.provider)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-700">
                    v{credential.version}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(credential.status, credential.isActive)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <TestStatusIndicator
                    testResult={testResults[credential.id]}
                    isTesting={testingIds.has(credential.id)}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-700">
                    {credential.lastRotatedAt
                      ? new Date(credential.lastRotatedAt).toLocaleDateString()
                      : 'Never'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-700">
                    {credential.expiresAt
                      ? new Date(credential.expiresAt).toLocaleDateString()
                      : 'Never'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onTestConnection(credential.id)}
                      >
                        <Zap className="mr-2 h-4 w-4" />
                        Test Connection
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onReveal(credential.id)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Reveal Credentials
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onRotate(credential.id)}
                      >
                        <RotateCw className="mr-2 h-4 w-4" />
                        Rotate
                      </DropdownMenuItem>
                      {credential.parentId && (
                        <DropdownMenuItem
                          onClick={() => onRollback(credential.id)}
                        >
                          <History className="mr-2 h-4 w-4" />
                          Rollback
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onViewHistory(credential.id)}
                      >
                        <History className="mr-2 h-4 w-4" />
                        Version History
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(credential.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
