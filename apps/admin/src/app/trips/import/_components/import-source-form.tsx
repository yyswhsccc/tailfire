'use client'

import { useState, useMemo, useRef } from 'react'
import { Loader2, Upload, FileText, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCruiseLineOptions } from '@/hooks/use-traveltek-reference'
import { useImportPreview } from '@/hooks/use-import-booking'
import { useOcrPreview } from '@/hooks/use-ocr-import'
import { ApiError } from '@/lib/api'
import type { ImportPreviewRequest, ImportPreviewResponse } from '@/types/import-booking.types'
import type { OcrPreviewResponse, OcrJobStatusResponse, OcrDocumentType } from '@tailfire/shared-types'

/**
 * Cruise line slugs that support booking import via Traveltek's cruiseimportbooking endpoint.
 * Add new slugs here as more cruise lines become import-compatible.
 */
const IMPORT_SUPPORTED_SLUGS = new Set([
  'royal-caribbean',
  'celebrity-cruises',
])

const PDF_DOCUMENT_TYPE_OPTIONS: { value: OcrDocumentType | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'flight_confirmation', label: 'Flight Confirmation' },
  { value: 'hotel_confirmation', label: 'Hotel Confirmation' },
  { value: 'cruise_confirmation', label: 'Cruise Confirmation' },
  { value: 'package_confirmation', label: 'All-Inclusive Package' },
  { value: 'transportation_confirmation', label: 'Transportation (Car Rental, Train, etc.)' },
  { value: 'dining_confirmation', label: 'Dining Reservation' },
  { value: 'passport', label: 'Passport' },
]

const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE_MB = 10

export interface ImportFormState {
  cruiseLineId: string | null
  bookingRef: string
  currency: string
}

interface ImportSourceFormProps {
  onPreviewSuccess: (data: ImportPreviewResponse, request: ImportPreviewRequest) => void
  onPdfResult?: (result: OcrPreviewResponse | OcrJobStatusResponse) => void
  isLoading: boolean
  formState: ImportFormState
  onFormStateChange: (state: ImportFormState) => void
  tripId?: string
}

export function ImportSourceForm({ onPreviewSuccess, onPdfResult, isLoading, formState, onFormStateChange, tripId }: ImportSourceFormProps) {
  const [sourceType, setSourceType] = useState('supplier-api')
  const [error, setError] = useState<string | null>(null)

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfDocType, setPdfDocType] = useState<string>('auto')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { cruiseLineId, bookingRef, currency } = formState

  const allCruiseLineOptions = useCruiseLineOptions()
  const cruiseLineOptions = useMemo(
    () => allCruiseLineOptions?.filter(opt => opt.data && IMPORT_SUPPORTED_SLUGS.has(opt.data.slug)),
    [allCruiseLineOptions],
  )
  const previewMutation = useImportPreview()
  const ocrPreviewMutation = useOcrPreview()

  const isPdf = sourceType === 'pdf'
  const canSubmitApi = !isPdf && cruiseLineId && bookingRef.trim() && !previewMutation.isPending && !isLoading
  const canSubmitPdf = isPdf && !!pdfFile && !ocrPreviewMutation.isPending && !isLoading
  const canSubmit = canSubmitApi || canSubmitPdf

  function updateField<K extends keyof ImportFormState>(key: K, value: ImportFormState[K]) {
    onFormStateChange({ ...formState, [key]: value })
  }

  function handleFileSelect(selectedFile: File) {
    setError(null)
    if (!ALLOWED_FILE_TYPES.includes(selectedFile.type)) {
      setError('Please upload a PDF, JPEG, or PNG file.')
      return
    }
    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File must be smaller than ${MAX_FILE_SIZE_MB}MB.`)
      return
    }
    setPdfFile(selectedFile)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) handleFileSelect(selectedFile)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setError(null)

    if (isPdf) {
      if (!pdfFile || !onPdfResult) return

      const formData = new FormData()
      formData.append('file', pdfFile)
      if (pdfDocType !== 'auto') formData.append('documentType', pdfDocType)
      if (tripId) formData.append('tripId', tripId)

      try {
        const result = await ocrPreviewMutation.mutateAsync(formData)
        onPdfResult(result)
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message || 'Failed to process document.')
        } else {
          setError('An unexpected error occurred. Please try again.')
        }
      }
    } else {
      if (!canSubmitApi) return

      const request: ImportPreviewRequest = {
        cruiseLineId: cruiseLineId!,
        bookingReference: bookingRef.trim(),
        currency,
      }

      try {
        const data = await previewMutation.mutateAsync(request)
        onPreviewSuccess(data, request)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError('No booking found with this reference for the selected cruise line.')
          } else {
            setError(err.message || 'Failed to fetch booking preview.')
          }
        } else {
          setError('An unexpected error occurred. Please try again.')
        }
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Source Type */}
      <Card>
        <CardHeader>
          <CardTitle>Import Source</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={sourceType} onValueChange={setSourceType} className="space-y-3">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="supplier-api" id="source-api" />
              <Label htmlFor="source-api" className="cursor-pointer">
                Supplier API
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pdf" id="source-pdf" />
              <Label htmlFor="source-pdf" className="cursor-pointer">
                Confirmation (PDF)
              </Label>
              <Badge variant="secondary" className="text-xs">
                OCR
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ai" id="source-ai" disabled />
              <Label htmlFor="source-ai" className="cursor-not-allowed text-ash-400">
                Fuzzy (AI)
              </Label>
              <Badge variant="outline" className="text-xs">
                Coming Soon
              </Badge>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Supplier API Details */}
      {!isPdf && (
        <Card>
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cruise Line */}
            <div className="space-y-2">
              <Label htmlFor="cruise-line">Cruise Line</Label>
              <Combobox
                options={cruiseLineOptions || []}
                value={cruiseLineId}
                onValueChange={(val) => updateField('cruiseLineId', val)}
                placeholder="Select a cruise line..."
                searchPlaceholder="Search cruise lines..."
                emptyText="No cruise lines found"
                disabled={!cruiseLineOptions}
              />
            </div>

            {/* Booking Reference */}
            <div className="space-y-2">
              <Label htmlFor="booking-ref">Booking Reference</Label>
              <Input
                id="booking-ref"
                value={bookingRef}
                onChange={(e) => updateField('bookingRef', e.target.value)}
                placeholder="Enter booking reference"
              />
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(val) => updateField('currency', val)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PDF Upload */}
      {isPdf && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!pdfFile ? (
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
                  PDF, JPEG, or PNG up to {MAX_FILE_SIZE_MB}MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md bg-ash-50 border">
                <FileText className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                  <p className="text-xs text-ash-500">
                    {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPdfFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={pdfDocType} onValueChange={setPdfDocType}>
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PDF_DOCUMENT_TYPE_OPTIONS.map((opt) => (
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
          </CardContent>
        </Card>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit */}
      <Button type="submit" disabled={!canSubmit}>
        {(previewMutation.isPending || ocrPreviewMutation.isPending) ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isPdf ? 'Processing...' : 'Fetching...'}
          </>
        ) : (
          isPdf ? 'Extract & Preview' : 'Preview Booking'
        )}
      </Button>
    </form>
  )
}
