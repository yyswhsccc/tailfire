'use client'

import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useDelayedJobs, useCancelJob, type DelayedJob } from '@/hooks/use-automation'
import { cn } from '@/lib/utils'

interface DelayedJobRowProps {
  job: DelayedJob
  onCancel: (jobId: string) => void
  isCancelling: boolean
}

function DelayedJobRow({ job, onCancel, isCancelling }: DelayedJobRowProps) {
  const [expanded, setExpanded] = useState(false)
  // Calculate scheduled time: timestamp + delay (both in ms)
  const scheduledFor = job.timestamp && job.delay
    ? new Date(job.timestamp + job.delay)
    : job.timestamp
      ? new Date(job.timestamp)
      : new Date()
  const isPast = scheduledFor < new Date()

  return (
    <>
      <TableRow className={cn(isPast && 'bg-amber-50')}>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="font-mono text-xs">{job.id}</TableCell>
        <TableCell>
          <Badge variant="outline">{job.name}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className="text-sm">
              {format(scheduledFor, 'MMM d, yyyy h:mm a')}
            </span>
            <span className={cn(
              'text-xs',
              isPast ? 'text-amber-600' : 'text-muted-foreground'
            )}>
              {isPast ? 'Overdue - ' : ''}
              {formatDistanceToNow(scheduledFor, { addSuffix: true })}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                disabled={isCancelling}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently cancel the scheduled job "{job.name}" (ID: {job.id}).
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Job</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onCancel(job.id)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Cancel Job
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/50 p-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Job Data</h4>
              <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(job.data, null, 2)}
              </pre>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Status: {job.status}</span>
                {job.progress !== undefined && <span>Progress: {job.progress}%</span>}
                {job.delay && <span>Delay: {Math.round(job.delay / 1000 / 60)} min</span>}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

interface DelayedJobsTableProps {
  queueName: string
  onClose: () => void
}

export function DelayedJobsTable({ queueName, onClose }: DelayedJobsTableProps) {
  const { data, isLoading, refetch } = useDelayedJobs(queueName)
  const cancelMutation = useCancelJob()

  const handleCancel = async (jobId: string) => {
    await cancelMutation.mutateAsync({ jobId, queue: queueName })
    refetch()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="capitalize">
              {queueName.replace('-', ' ')} - Delayed Jobs
            </CardTitle>
            <CardDescription>
              {data?.count ?? 0} jobs scheduled to run in the future
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !data?.jobs.length ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No delayed jobs in this queue
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-40">Job ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Scheduled For</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.jobs.map((job) => (
                <DelayedJobRow
                  key={job.id}
                  job={job}
                  onCancel={handleCancel}
                  isCancelling={cancelMutation.isPending}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
