'use client'

import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
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
import { ApiError } from '@/lib/api'
import type { ImportPreviewRequest, ImportPreviewResponse } from '@/types/import-booking.types'

/**
 * Cruise line slugs that support booking import via Traveltek's cruiseimportbooking endpoint.
 * Add new slugs here as more cruise lines become import-compatible.
 */
const IMPORT_SUPPORTED_SLUGS = new Set([
  'royal-caribbean',
  'celebrity-cruises',
])

export interface ImportFormState {
  cruiseLineId: string | null
  bookingRef: string
  currency: string
}

interface ImportSourceFormProps {
  onPreviewSuccess: (data: ImportPreviewResponse, request: ImportPreviewRequest) => void
  isLoading: boolean
  formState: ImportFormState
  onFormStateChange: (state: ImportFormState) => void
}

export function ImportSourceForm({ onPreviewSuccess, isLoading, formState, onFormStateChange }: ImportSourceFormProps) {
  const [sourceType, setSourceType] = useState('supplier-api')
  const [error, setError] = useState<string | null>(null)

  const { cruiseLineId, bookingRef, currency } = formState

  const allCruiseLineOptions = useCruiseLineOptions()
  const cruiseLineOptions = useMemo(
    () => allCruiseLineOptions?.filter(opt => opt.data && IMPORT_SUPPORTED_SLUGS.has(opt.data.slug)),
    [allCruiseLineOptions],
  )
  const previewMutation = useImportPreview()

  const canSubmit = cruiseLineId && bookingRef.trim() && !previewMutation.isPending && !isLoading

  function updateField<K extends keyof ImportFormState>(key: K, value: ImportFormState[K]) {
    onFormStateChange({ ...formState, [key]: value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setError(null)

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
              <RadioGroupItem value="pdf" id="source-pdf" disabled />
              <Label htmlFor="source-pdf" className="cursor-not-allowed text-ash-400">
                Confirmation (PDF)
              </Label>
              <Badge variant="outline" className="text-xs">
                Coming Soon
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

      {/* Booking Details */}
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

      {/* Error Banner */}
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
            Fetching...
          </>
        ) : (
          'Preview Booking'
        )}
      </Button>
    </form>
  )
}
