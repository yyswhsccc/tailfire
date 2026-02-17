'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TernCard, TernCardContent, TernCardHeader, TernCardTitle } from '@/components/tern/core/tern-card'
import { TernButton } from '@/components/tern/core/tern-button'
import { TernBadge } from '@/components/tern/core/tern-badge'
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

  const cruiseLineOptions = useCruiseLineOptions()
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
      <TernCard>
        <TernCardHeader>
          <TernCardTitle>Import Source</TernCardTitle>
        </TernCardHeader>
        <TernCardContent>
          <RadioGroup value={sourceType} onValueChange={setSourceType} className="space-y-3">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="supplier-api" id="source-api" />
              <Label htmlFor="source-api" className="cursor-pointer">
                Supplier API
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pdf" id="source-pdf" disabled />
              <Label htmlFor="source-pdf" className="cursor-not-allowed text-tern-gray-400">
                Confirmation (PDF)
              </Label>
              <TernBadge variant="outline" className="text-xs">
                Coming Soon
              </TernBadge>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ai" id="source-ai" disabled />
              <Label htmlFor="source-ai" className="cursor-not-allowed text-tern-gray-400">
                Fuzzy (AI)
              </Label>
              <TernBadge variant="outline" className="text-xs">
                Coming Soon
              </TernBadge>
            </div>
          </RadioGroup>
        </TernCardContent>
      </TernCard>

      {/* Booking Details */}
      <TernCard>
        <TernCardHeader>
          <TernCardTitle>Booking Details</TernCardTitle>
        </TernCardHeader>
        <TernCardContent className="space-y-4">
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
        </TernCardContent>
      </TernCard>

      {/* Error Banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit */}
      <TernButton type="submit" disabled={!canSubmit}>
        {previewMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Fetching...
          </>
        ) : (
          'Preview Booking'
        )}
      </TernButton>
    </form>
  )
}
