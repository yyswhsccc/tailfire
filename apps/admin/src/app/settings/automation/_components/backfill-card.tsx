'use client'

import { useState } from 'react'
import { Zap, Loader2, CheckCircle2, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTriggerBackfill } from '@/hooks/use-automation'
import { toast } from 'sonner'

export function BackfillCard() {
  const [batchSize, setBatchSize] = useState(100)
  const backfillMutation = useTriggerBackfill()

  const handleBackfill = async () => {
    try {
      const result = await backfillMutation.mutateAsync(batchSize)
      toast.success(`Backfill job scheduled: ${result.jobId}`, {
        description: `Processing ${result.batchSize} trips per batch`,
      })
    } catch (error) {
      toast.error('Failed to trigger backfill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Trip Backfill
        </CardTitle>
        <CardDescription>
          Schedule automation jobs for existing trips that have dates but no scheduled transitions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This will scan all <strong>booked</strong> and <strong>in_progress</strong> trips with start/end dates,
            and schedule auto-transition jobs for any trips that don't have them yet.
          </AlertDescription>
        </Alert>

        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="batchSize">Batch Size</Label>
            <Input
              id="batchSize"
              type="number"
              min={10}
              max={1000}
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 100)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Number of trips to process per batch
            </p>
          </div>

          <Button
            onClick={handleBackfill}
            disabled={backfillMutation.isPending}
          >
            {backfillMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : backfillMutation.isSuccess ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Scheduled!
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Run Backfill
              </>
            )}
          </Button>
        </div>

        {backfillMutation.isSuccess && backfillMutation.data && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Backfill job <code className="rounded bg-green-100 px-1">{backfillMutation.data.jobId}</code> has been
              scheduled. Check the trip-automation queue to monitor progress.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
