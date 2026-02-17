'use client'

import { RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatDistanceToNow } from 'date-fns'

interface SyncStatusBannerProps {
  lastSyncedAt: string | null
  isStuck?: boolean
  onForceReset?: () => void
}

export function SyncStatusBanner({ lastSyncedAt, isStuck, onForceReset }: SyncStatusBannerProps) {
  const lastSyncedText = lastSyncedAt
    ? formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })
    : 'never'

  if (isStuck) {
    return (
      <Alert variant="destructive" className="mb-4 border-amber-500 bg-amber-50">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            Sync appears stuck (running for over 1 hour). Last successful sync: {lastSyncedText}
          </span>
          {onForceReset && (
            <button
              onClick={onForceReset}
              className="text-sm font-medium text-amber-700 hover:text-amber-800 underline"
            >
              Force Reset
            </button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="mb-4 border-phoenix-gold-200 bg-phoenix-gold-50">
      <RefreshCw className="h-4 w-4 animate-spin text-phoenix-gold-600" />
      <AlertDescription className="flex items-center gap-2 text-phoenix-gold-700">
        <span>
          Cruise data is syncing from Traveltek. Prices may update momentarily.
        </span>
        {lastSyncedAt && (
          <span className="text-phoenix-gold-500 text-sm flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last sync: {lastSyncedText}
          </span>
        )}
      </AlertDescription>
    </Alert>
  )
}
