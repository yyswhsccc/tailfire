'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2, Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { useUser } from '@/hooks/use-user'
import type {
  ItineraryTemplateResponse,
  PackageTemplateResponse,
  SaveItineraryAsTemplateDto,
  SavePackageAsTemplateDto,
} from '@tailfire/shared-types'

interface SaveAsTemplateDialogProps {
  /** Type of item being saved as template */
  type: 'itinerary' | 'package'
  /** ID of the itinerary or package to save */
  itemId: string | null
  /** Default name for the template (e.g., original itinerary/package name) */
  defaultName?: string
  /** Dialog open state */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback on successful save */
  onSuccess?: (template: ItineraryTemplateResponse | PackageTemplateResponse) => void
}

/**
 * Save as Template Dialog
 *
 * Used to save an existing itinerary or package as a reusable template.
 * The template will be stored in the library and can be applied to future trips.
 */
export function SaveAsTemplateDialog({
  type,
  itemId,
  defaultName,
  open,
  onOpenChange,
  onSuccess,
}: SaveAsTemplateDialogProps) {
  const { agencyId } = useUser()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(defaultName || '')
      setDescription('')
      setError(null)
    }
  }, [open, defaultName])

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (!itemId) {
      setError('No item selected')
      return
    }

    if (!agencyId) {
      setError('Agency context not available')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      let template: ItineraryTemplateResponse | PackageTemplateResponse

      if (type === 'itinerary') {
        const dto: SaveItineraryAsTemplateDto = {
          agencyId,
          name: name.trim(),
          description: description.trim() || undefined,
        }
        template = await api.post<ItineraryTemplateResponse>(
          `/itineraries/${itemId}/save-as-template`,
          dto
        )
      } else {
        const dto: SavePackageAsTemplateDto = {
          agencyId,
          name: name.trim(),
          description: description.trim() || undefined,
        }
        template = await api.post<PackageTemplateResponse>(
          `/packages/${itemId}/save-as-template`,
          dto
        )
      }

      onOpenChange(false)
      onSuccess?.(template)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [type, itemId, name, description, agencyId, onOpenChange, onSuccess])

  const typeLabel = type === 'itinerary' ? 'Itinerary' : 'Package'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-phoenix-gold-600" />
            Save {typeLabel} as Template
          </DialogTitle>
          <DialogDescription>
            Save this {type} as a reusable template in your library. You can apply it to future
            trips to quickly recreate the same structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="templateName">Template Name</Label>
            <Input
              id="templateName"
              placeholder={`e.g., ${type === 'itinerary' ? '7-Day Hawaii Escape' : 'Caribbean Cruise Add-on'}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateDescription">Description (optional)</Label>
            <Textarea
              id="templateDescription"
              placeholder="Brief description of what this template includes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
            <strong>What gets saved:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>Day structure with relative offsets</li>
              <li>Activity names, times, and details</li>
              <li>Pricing information (amounts preserved)</li>
              {type === 'package' && <li>Package metadata and pricing type</li>}
            </ul>
            <p className="mt-2 text-xs text-blue-600">
              Dates will be recalculated when the template is applied to a new trip.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !agencyId}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save to Library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
