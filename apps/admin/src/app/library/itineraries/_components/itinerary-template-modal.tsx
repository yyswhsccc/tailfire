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
import { api, ApiError } from '@/lib/api'
import type { ItineraryTemplateResponse, CreateItineraryTemplateDto, UpdateItineraryTemplateDto } from '@tailfire/shared-types'

interface ItineraryTemplateModalProps {
  template: ItineraryTemplateResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencyId: string
}

export function ItineraryTemplateModal({
  template,
  open,
  onOpenChange,
  onSuccess,
  agencyId,
}: ItineraryTemplateModalProps) {
  const isEditing = !!template

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)

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
      } else {
        setName('')
        setDescription('')
        setIsActive(true)
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
        const updateDto: UpdateItineraryTemplateDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          isActive,
        }
        await api.patch(`/templates/itineraries/${template.id}`, updateDto)
      } else {
        // Create new template (with empty payload - user should save from existing itinerary)
        const createDto: CreateItineraryTemplateDto = {
          agencyId,
          name: name.trim(),
          description: description.trim() || undefined,
          payload: { dayOffsets: [] },
        }
        await api.post('/templates/itineraries', createDto)
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
  }, [name, description, isActive, isEditing, template, agencyId, onSuccess])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the template name and description.'
              : 'Create a new itinerary template. To populate with days and activities, save an existing itinerary as a template.'}
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
              placeholder="e.g., 7-Day Hawaii Escape"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of what this template includes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {isEditing && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive templates won&apos;t appear in the template picker
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
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{template.payload.dayOffsets.length} days</span>
                    <span>
                      {template.payload.dayOffsets.reduce((sum, d) => sum + d.activities.length, 0)}{' '}
                      activities
                    </span>
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
