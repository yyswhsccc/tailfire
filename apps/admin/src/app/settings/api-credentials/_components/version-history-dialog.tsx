'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import { CredentialStatus } from '@tailfire/shared-types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useCredentialHistory } from '@/hooks/use-api-credentials'
import { TableSkeleton } from '@/components/shared/loading-skeleton'

interface VersionHistoryDialogProps {
  credentialId: string | null
  credentialName: string
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function VersionHistoryDialog({
  credentialId,
  credentialName,
  open,
  onOpenChange,
}: VersionHistoryDialogProps) {
  const { data: history, isLoading } = useCredentialHistory(credentialId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            All versions of {credentialName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : !history || history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No version history available
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((version, index) => (
              <div
                key={version.id}
                className="flex gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0 pt-1">
                  {version.isActive ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold">
                        Version {version.version}
                      </h4>
                      {getStatusBadge(version.status, version.isActive)}
                      {index === 0 && (
                        <Badge variant="outline" className="text-xs">
                          Latest
                        </Badge>
                      )}
                    </div>
                    <time className="text-sm text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </time>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Created:</span>{' '}
                      {new Date(version.createdAt).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Rotated:</span>{' '}
                      {version.lastRotatedAt
                        ? new Date(version.lastRotatedAt).toLocaleDateString()
                        : 'Never'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expires:</span>{' '}
                      {version.expiresAt
                        ? new Date(version.expiresAt).toLocaleDateString()
                        : 'Never'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Parent ID:</span>{' '}
                      {version.parentId ? version.parentId.slice(0, 8) + '...' : 'None (Original)'}
                    </div>
                  </div>

                  {version.parentId && (
                    <p className="text-xs text-muted-foreground">
                      This version was created by rotating the previous version
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
