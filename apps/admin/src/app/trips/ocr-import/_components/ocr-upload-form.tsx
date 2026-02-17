'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOcrPreview } from '@/hooks/use-ocr-import'
import { ApiError } from '@/lib/api'
import type { OcrPreviewResponse, OcrJobStatusResponse, OcrDocumentType } from '@tailfire/shared-types'

const DOCUMENT_TYPE_OPTIONS: { value: OcrDocumentType | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'flight_confirmation', label: 'Flight Confirmation' },
  { value: 'hotel_confirmation', label: 'Hotel Confirmation' },
  { value: 'cruise_confirmation', label: 'Cruise Confirmation' },
  { value: 'transportation_confirmation', label: 'Transportation (Car Rental, Train, etc.)' },
  { value: 'dining_confirmation', label: 'Dining Reservation' },
  { value: 'passport', label: 'Passport' },
]

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE_MB = 10

interface OcrUploadFormProps {
  tripId?: string
  contactId?: string
  onResult: (result: OcrPreviewResponse | OcrJobStatusResponse) => void
}

export function OcrUploadForm({ tripId, contactId, onResult }: OcrUploadFormProps) {
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<string>('auto')
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewMutation = useOcrPreview()

  function handleFileSelect(selectedFile: File) {
    setError(null)

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError('Please upload a PDF, JPEG, or PNG file.')
      return
    }

    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be smaller than ${MAX_SIZE_MB}MB.`)
      return
    }

    setFile(selectedFile)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) handleFileSelect(selectedFile)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    if (documentType !== 'auto') {
      formData.append('documentType', documentType)
    }
    if (tripId) formData.append('tripId', tripId)
    if (contactId) formData.append('contactId', contactId)

    try {
      const result = await previewMutation.mutateAsync(formData)
      onResult(result)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to process document.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    }
  }

  const canSubmit = !!file && !previewMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-ash-300 hover:border-ash-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-10 w-10 text-ash-400 mb-3" />
              <p className="text-sm font-medium">
                Drop a file here, or click to browse
              </p>
              <p className="text-xs text-ash-500 mt-1">
                PDF, JPEG, or PNG up to {MAX_SIZE_MB}MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-md bg-ash-50 border">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-ash-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ash-500">
              Leave as auto-detect to let the system identify the document type.
            </p>
          </div>

          {tripId && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm text-blue-800">
                Activity will be added to the existing trip.
              </p>
            </div>
          )}

          {contactId && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm text-blue-800">
                Passport data will be linked to the existing contact.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit */}
      <Button type="submit" disabled={!canSubmit}>
        {previewMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Extract & Preview'
        )}
      </Button>
    </form>
  )
}
