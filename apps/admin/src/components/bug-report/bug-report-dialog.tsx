'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { ScreenshotCapture } from './screenshot-capture'
import { useConsoleCapture } from '@/providers/console-capture-provider'
import { useBugReport, type BugReportType } from '@/hooks/use-bug-report'

const bugReportSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  type: z.enum(['bug', 'feature', 'question']),
})

type BugReportFormValues = z.infer<typeof bugReportSchema>

interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  autoScreenshot: Blob | null
}

export function BugReportDialog({
  open,
  onOpenChange,
  autoScreenshot: initialAutoScreenshot,
}: BugReportDialogProps) {
  const { getConsoleLogs } = useConsoleCapture()
  const { toast } = useToast()
  const bugReportMutation = useBugReport()

  const [autoScreenshot, setAutoScreenshot] = useState<Blob | null>(initialAutoScreenshot)
  const [manualScreenshots, setManualScreenshots] = useState<File[]>([])
  const [consoleLogs] = useState(() => getConsoleLogs())
  const [logsOpen, setLogsOpen] = useState(false)

  // Sync auto-screenshot when prop changes (capture completes after dialog opens)
  useEffect(() => {
    if (initialAutoScreenshot) {
      setAutoScreenshot(initialAutoScreenshot)
    }
  }, [initialAutoScreenshot])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BugReportFormValues>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: { title: '', description: '', type: 'bug' },
  })

  const selectedType = watch('type')

  const onSubmit = async (values: BugReportFormValues) => {
    try {
      const result = await bugReportMutation.mutateAsync({
        ...values,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        consoleLogs: consoleLogs.length ? JSON.stringify(consoleLogs) : undefined,
        autoScreenshot,
        manualScreenshots,
      })

      toast({
        title: 'Bug report submitted!',
        description: `Issue #${result.issueNumber} created — ${result.issueUrl}`,
      })

      reset()
      setAutoScreenshot(null)
      setManualScreenshots([])
      onOpenChange(false)
    } catch {
      toast({
        title: 'Failed to submit bug report',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Submit a bug report, feature request, or question. This creates a GitHub issue for the team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={selectedType}
              onValueChange={(v) => setValue('type', v as BugReportType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">Title</Label>
            <Input
              id="bug-title"
              placeholder="Brief summary of the issue"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-description">Description</Label>
            <Textarea
              id="bug-description"
              placeholder="Steps to reproduce, expected vs actual behavior..."
              rows={4}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Page URL (read-only) */}
          <div className="space-y-1.5">
            <Label>Page URL</Label>
            <Input value={typeof window !== 'undefined' ? window.location.href : ''} readOnly className="bg-ash-50 text-ash-500" />
          </div>

          {/* Screenshots */}
          <div className="space-y-1.5">
            <Label>Screenshots</Label>
            {!autoScreenshot && manualScreenshots.length === 0 && (
              <div className="flex items-center gap-2 rounded border border-dashed border-ash-300 bg-ash-50 p-3 text-sm text-ash-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-ash-300 border-t-phoenix-gold-600" />
                Capturing screenshot...
              </div>
            )}
            <ScreenshotCapture
              autoScreenshot={autoScreenshot}
              screenshots={manualScreenshots}
              onScreenshotsChange={setManualScreenshots}
              onRemoveAutoScreenshot={() => setAutoScreenshot(null)}
            />
          </div>

          {/* Console Logs */}
          {consoleLogs.length > 0 && (
            <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-ash-600">
                  <ChevronDown className={`h-4 w-4 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                  Console Logs ({consoleLogs.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-ash-50 p-2 text-xs text-ash-700">
                  {consoleLogs.map((log, i) => (
                    <div key={i} className={log.level === 'error' ? 'text-red-600' : 'text-amber-600'}>
                      [{log.level.toUpperCase()}] {new Date(log.timestamp).toLocaleTimeString()} - {log.message}
                    </div>
                  ))}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={bugReportMutation.isPending}>
              {bugReportMutation.isPending ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
