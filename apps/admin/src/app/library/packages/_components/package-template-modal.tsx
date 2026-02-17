'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api, ApiError } from '@/lib/api'
import type { PackageTemplateResponse, CreatePackageTemplateDto, UpdatePackageTemplateDto } from '@tailfire/shared-types'

interface PackageTemplateModalProps {
  template: PackageTemplateResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencyId: string
}

export function PackageTemplateModal({
  template,
  open,
  onOpenChange,
  onSuccess,
  agencyId,
}: PackageTemplateModalProps) {
  const isEditing = !!template

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [pricingType, setPricingType] = useState<'flat_rate' | 'per_person'>('flat_rate')

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes or template changes
  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name)
        setDescription(template.description || '')
        setIsActive(template.isActive)
        setPricingType(template.payload.packageMetadata.pricingType || 'flat_rate')
      } else {
        setName('')
        setDescription('')
        setIsActive(true)
        setPricingType('flat_rate')
      }
      setError(null)
    }
  }, [open, template])

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditing && template) {
        // Update existing template
        const updateDto: UpdatePackageTemplateDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          isActive,
          // Preserve existing payload but allow updating metadata
          payload: {
            ...template.payload,
            packageMetadata: {
              ...template.payload.packageMetadata,
              name: name.trim(),
              pricingType,
            },
          },
        }
        await api.patch(`/templates/packages/${template.id}`, updateDto)
      } else {
        // Create new template (with empty payload - user should save from existing package)
        const createDto: CreatePackageTemplateDto = {
          agencyId,
          name: name.trim(),
          description: description.trim() || undefined,
          payload: {
            packageMetadata: {
              name: name.trim(),
              pricingType,
            },
            dayOffsets: [],
          },
        }
        await api.post('/templates/packages', createDto)
      }
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [name, description, isActive, pricingType, isEditing, template, agencyId, onSuccess])

  // Format price for display
  const formatPrice = (cents: number | null | undefined, currency: string | null | undefined) => {
    if (cents == null) return '-'
    const amount = cents / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the template name, description, and settings.'
              : 'Create a new package template. To populate with activities, save an existing package as a template.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Caribbean Cruise Add-on"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of what this package includes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pricingType">Pricing Type</Label>
            <Select value={pricingType} onValueChange={(v) => setPricingType(v as 'flat_rate' | 'per_person')}>
              <SelectTrigger id="pricingType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat_rate">Flat Rate</SelectItem>
                <SelectItem value="per_person">Per Person</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {pricingType === 'flat_rate'
                ? 'Single price for the entire package'
                : 'Price multiplied by number of travelers'}
            </p>
          </div>

          {isEditing && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive templates won&apos;t appear in the package library
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              {/* Show template stats */}
              {template && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-ash-700 mb-2">Template Contents</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Days:</span>{' '}
                      {template.payload.dayOffsets.length}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Activities:</span>{' '}
                      {template.payload.dayOffsets.reduce((sum, d) => sum + d.activities.length, 0)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Base Price:</span>{' '}
                      {formatPrice(
                        template.payload.packageMetadata.totalPriceCents,
                        template.payload.packageMetadata.currency
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pricing:</span>{' '}
                      {template.payload.packageMetadata.pricingType === 'per_person'
                        ? 'Per Person'
                        : 'Flat Rate'}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
