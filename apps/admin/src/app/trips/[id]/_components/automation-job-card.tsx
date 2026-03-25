'use client'

import { format, formatDistanceToNow, parseISO } from 'date-fns'
import {
  Pause,
  Play,
  XCircle,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Mail,
  Zap,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AutomationJob } from '@/hooks/use-automations'

// ============================================================================
// Job type display mapping
// ============================================================================

const JOB_TYPE_LABELS: Record<string, string> = {
  'insurance.proposal.email': 'Insurance proposal email',
  'insurance.reminder.email': 'Insurance reminder email',
  'trip.status.transition': 'Trip status transition',
  'trip.reminder': 'Trip reminder',
  'client-care.followup': 'Client care follow-up',
  'notification.email': 'Email notification',
  'notification.push': 'Push notification',
}

function getJobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] || jobType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getJobTypeIcon(jobType: string) {
  if (jobType.includes('email') || jobType.includes('mail')) return Mail
  return Zap
}

// ============================================================================
// Status configuration
// ============================================================================

const STATUS_CONFIG: Record<
  AutomationJob['status'],
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'destructive'
    className: string
    icon: typeof Clock
  }
> = {
  queued: {
    label: 'Queued',
    variant: 'outline',
    className: 'border-blue-300 text-blue-700 bg-blue-50',
    icon: Clock,
  },
  processing: {
    label: 'Processing',
    variant: 'outline',
    className: 'border-amber-300 text-amber-700 bg-amber-50',
    icon: Loader2,
  },
  completed: {
    label: 'Completed',
    variant: 'default',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    className: '',
    icon: AlertTriangle,
  },
  paused: {
    label: 'Paused',
    variant: 'secondary',
    className: 'bg-zinc-100 text-zinc-600',
    icon: Pause,
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'secondary',
    className: 'bg-zinc-100 text-zinc-500 line-through',
    icon: Ban,
  },
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(dateString: string | undefined): string {
  if (!dateString) return ''
  try {
    const date = parseISO(dateString)
    return format(date, 'MMM d, yyyy h:mm a')
  } catch {
    return dateString
  }
}

function getRelativeTime(dateString: string | undefined): string {
  if (!dateString) return ''
  try {
    const date = parseISO(dateString)
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return ''
  }
}

/**
 * Extract human-readable details from jobData
 */
function getJobDetails(job: AutomationJob): string | null {
  const data = job.jobData
  if (!data) return null

  const parts: string[] = []

  // Recipient name
  if (data.recipientName && typeof data.recipientName === 'string') {
    parts.push(data.recipientName)
  } else if (data.travelerName && typeof data.travelerName === 'string') {
    parts.push(data.travelerName)
  }

  // Email
  if (data.recipientEmail && typeof data.recipientEmail === 'string') {
    parts.push(data.recipientEmail)
  } else if (data.email && typeof data.email === 'string') {
    parts.push(data.email)
  }

  return parts.length > 0 ? parts.join(' - ') : null
}

// ============================================================================
// Component
// ============================================================================

interface AutomationJobCardProps {
  job: AutomationJob
  onPause: (jobId: string) => void
  onResume: (jobId: string) => void
  onCancel: (jobId: string) => void
  isPausing?: boolean
  isResuming?: boolean
  isCancelling?: boolean
}

export function AutomationJobCard({
  job,
  onPause,
  onResume,
  onCancel,
  isPausing,
  isResuming,
  isCancelling,
}: AutomationJobCardProps) {
  const statusConfig = STATUS_CONFIG[job.status]
  const StatusIcon = statusConfig.icon
  const JobIcon = getJobTypeIcon(job.jobType)
  const details = getJobDetails(job)
  const isCancelled = job.status === 'cancelled'

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 rounded-md bg-ash-100 p-2">
            <JobIcon className="h-4 w-4 text-ash-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-medium text-ash-900 ${isCancelled ? 'line-through text-ash-500' : ''}`}
              >
                {getJobTypeLabel(job.jobType)}
              </span>
              <Badge
                variant={statusConfig.variant}
                className={`gap-1 text-xs ${statusConfig.className}`}
              >
                <StatusIcon
                  className={`h-3 w-3 ${job.status === 'processing' ? 'animate-spin' : ''}`}
                />
                {statusConfig.label}
              </Badge>
            </div>

            {/* Details (recipient, email) */}
            {details && (
              <p className="text-xs text-ash-500 mt-0.5 truncate">{details}</p>
            )}

            {/* Error message */}
            {job.errorMessage && (
              <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>
            )}

            {/* Timestamps */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-ash-400">
              <span title={formatTimestamp(job.createdAt)}>
                Created {getRelativeTime(job.createdAt)}
              </span>
              {job.scheduledFor && (
                <span title={formatTimestamp(job.scheduledFor)}>
                  Scheduled for {formatTimestamp(job.scheduledFor)}
                </span>
              )}
              {job.completedAt && (
                <span title={formatTimestamp(job.completedAt)}>
                  Completed {getRelativeTime(job.completedAt)}
                </span>
              )}
              {job.pausedAt && (
                <span title={formatTimestamp(job.pausedAt)}>
                  Paused {getRelativeTime(job.pausedAt)}
                </span>
              )}
              {job.cancelledAt && (
                <span title={formatTimestamp(job.cancelledAt)}>
                  Cancelled {getRelativeTime(job.cancelledAt)}
                  {job.cancelledBy ? ` by ${job.cancelledBy}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {job.status === 'queued' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPause(job.id)}
                disabled={isPausing}
                title="Pause job"
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onCancel(job.id)}
                disabled={isCancelling}
                title="Cancel job"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          {job.status === 'paused' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onResume(job.id)}
                disabled={isResuming}
                title="Resume job"
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onCancel(job.id)}
                disabled={isCancelling}
                title="Cancel job"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
