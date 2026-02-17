'use client'

import { useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOcrJobStatus } from '@/hooks/use-ocr-import'
import type { OcrPreviewResponse } from '@tailfire/shared-types'

interface OcrProcessingStatusProps {
  jobId: string
  onComplete: (preview: OcrPreviewResponse) => void
  onBack: () => void
}

export function OcrProcessingStatus({ jobId, onComplete, onBack }: OcrProcessingStatusProps) {
  const { data, isError } = useOcrJobStatus(jobId)

  useEffect(() => {
    if (data?.status === 'preview_ready' && data.preview) {
      onComplete(data.preview)
    }
  }, [data, onComplete])

  const isFailed = data?.status === 'failed'
  const isProcessing = !data || data.status === 'processing' || data.status === 'pending'

  return (
    <div className="max-w-2xl">
      <Card>
        <CardContent className="py-12 text-center">
          {isProcessing && !isError && (
            <>
              <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-4" />
              <h3 className="text-lg font-medium">Processing Document</h3>
              <p className="text-sm text-ash-500 mt-2">
                This may take up to a minute for complex documents.
              </p>
            </>
          )}

          {(isFailed || isError) && (
            <>
              <AlertCircle className="mx-auto h-10 w-10 text-red-500 mb-4" />
              <h3 className="text-lg font-medium text-red-800">Extraction Failed</h3>
              <p className="text-sm text-ash-500 mt-2">
                {data?.errorMessage || 'An error occurred while processing the document.'}
              </p>
              <Button variant="outline" className="mt-4" onClick={onBack}>
                Try Again
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
