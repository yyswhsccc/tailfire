'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateLoyaltyProgram, useUpdateLoyaltyProgram } from '@/hooks/use-loyalty-programs'
import { useLoyaltyProgramsCatalog } from '@/hooks/use-loyalty-programs-catalog'
import { useToast } from '@/hooks/use-toast'
import type { LoyaltyProgramDto, LoyaltyProgramCatalogDto } from '@tailfire/shared-types/api'

interface LoyaltyProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  loyaltyProgram?: LoyaltyProgramDto | null
}

interface LoyaltyProgramFormData {
  providerName: string
  programName: string
  membershipNumber: string
  tierLevel: string
  notes: string
}

const TYPE_LABELS: Record<string, string> = {
  cruise: 'Cruise Lines',
  airline: 'Airlines',
  hotel: 'Hotels',
  other: 'Other',
}

export function LoyaltyProgramDialog({
  open,
  onOpenChange,
  contactId,
  loyaltyProgram,
}: LoyaltyProgramDialogProps) {
  const isEditing = !!loyaltyProgram
  const { toast } = useToast()
  const createLoyaltyProgram = useCreateLoyaltyProgram()
  const updateLoyaltyProgram = useUpdateLoyaltyProgram()

  // Fetch catalog programs (active only)
  const { data: catalogData } = useLoyaltyProgramsCatalog({ active: 'true', limit: 100 })
  const catalogPrograms = catalogData?.programs ?? []

  // Track selected catalog item ID
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)

  // Group catalog programs by type
  const groupedPrograms = useMemo(() => {
    const groups: Record<string, LoyaltyProgramCatalogDto[]> = {}
    for (const p of catalogPrograms) {
      const type = p.programType || 'other'
      if (!groups[type]) groups[type] = []
      groups[type].push(p)
    }
    return groups
  }, [catalogPrograms])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<LoyaltyProgramFormData>({
    defaultValues: {
      providerName: '',
      programName: '',
      membershipNumber: '',
      tierLevel: '',
      notes: '',
    },
  })

  const providerName = watch('providerName')

  // Determine if current provider matches a catalog entry
  const isCustomProvider = useMemo(() => {
    if (selectedCatalogId === '__custom') return true
    if (selectedCatalogId) return false
    // Check if the current provider/program matches any catalog entry
    return !catalogPrograms.some(
      (p) => p.providerName === providerName,
    )
  }, [selectedCatalogId, providerName, catalogPrograms])

  useEffect(() => {
    if (open) {
      reset({
        providerName: loyaltyProgram?.providerName || '',
        programName: loyaltyProgram?.programName || '',
        membershipNumber: loyaltyProgram?.membershipNumber || '',
        tierLevel: loyaltyProgram?.tierLevel || '',
        notes: loyaltyProgram?.notes || '',
      })
      // Restore catalog selection for editing, or default to custom if catalog is empty
      if (loyaltyProgram?.loyaltyProgramId) {
        setSelectedCatalogId(loyaltyProgram.loyaltyProgramId)
      } else if (catalogPrograms.length === 0) {
        setSelectedCatalogId('__custom')
      } else {
        setSelectedCatalogId(null)
      }
    }
  }, [open, loyaltyProgram, reset, catalogPrograms.length])

  const handleCatalogSelect = (value: string) => {
    if (value === '__custom') {
      setSelectedCatalogId('__custom')
      setValue('providerName', '', { shouldDirty: true })
      setValue('programName', '', { shouldDirty: true })
      return
    }

    const item = catalogPrograms.find((p) => p.id === value)
    if (item) {
      setSelectedCatalogId(item.id)
      setValue('providerName', item.providerName, { shouldDirty: true })
      setValue('programName', item.programName, { shouldDirty: true })
    }
  }

  const onSubmit = async (data: LoyaltyProgramFormData) => {
    try {
      const catalogId = selectedCatalogId && selectedCatalogId !== '__custom'
        ? selectedCatalogId
        : undefined

      if (isEditing && loyaltyProgram) {
        await updateLoyaltyProgram.mutateAsync({
          contactId,
          programId: loyaltyProgram.id,
          data: {
            providerName: data.providerName,
            programName: data.programName,
            membershipNumber: data.membershipNumber,
            tierLevel: data.tierLevel || undefined,
            notes: data.notes || undefined,
            loyaltyProgramId: catalogId,
          },
        })

        toast({
          title: 'Loyalty program updated',
          description: 'The loyalty program has been successfully updated.',
        })
      } else {
        await createLoyaltyProgram.mutateAsync({
          contactId,
          data: {
            providerName: data.providerName,
            programName: data.programName,
            membershipNumber: data.membershipNumber,
            tierLevel: data.tierLevel || undefined,
            notes: data.notes || undefined,
            loyaltyProgramId: catalogId,
          },
        })

        toast({
          title: 'Loyalty program added',
          description: 'The loyalty program has been successfully added.',
        })
      }

      onOpenChange(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.'
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'add'} loyalty program. ${errorMessage}`,
        variant: 'destructive',
      })
    }
  }

  // Build the select value
  const selectValue = selectedCatalogId === '__custom'
    ? '__custom'
    : selectedCatalogId || (isCustomProvider ? '__custom' : '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Loyalty Program</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of this loyalty program membership.'
              : 'Add a loyalty or rewards program membership for this contact.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Provider Selection (from catalog) — only show dropdown if catalog has items */}
          {catalogPrograms.length > 0 ? (
            <div className="space-y-2">
              <Label>Provider *</Label>
              <Select value={selectValue} onValueChange={handleCatalogSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedPrograms).map(([type, programs]) => (
                    <SelectGroup key={type}>
                      <SelectLabel>{TYPE_LABELS[type] || type}</SelectLabel>
                      {programs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.providerName} — {p.programName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectGroup>
                    <SelectLabel>Custom</SelectLabel>
                    <SelectItem value="__custom">Other (type below)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {/* Custom provider fields */}
              {isCustomProvider && (
                <div className="space-y-2 pt-1">
                  <Input
                    {...register('providerName', { required: 'Provider is required' })}
                    placeholder="e.g., Silversea Cruises"
                  />
                  {errors.providerName && (
                    <p className="text-xs text-red-600">{errors.providerName.message}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No catalog — show custom provider fields directly */
            <div className="space-y-2">
              <Label>Provider *</Label>
              <Input
                {...register('providerName', { required: 'Provider is required' })}
                placeholder="e.g., Royal Caribbean, Air Canada"
              />
              {errors.providerName && (
                <p className="text-xs text-red-600">{errors.providerName.message}</p>
              )}
            </div>
          )}

          {/* Program Name (editable for custom or when no catalog) */}
          {(isCustomProvider || catalogPrograms.length === 0) && (
            <div className="space-y-2">
              <Label htmlFor="programName">Program Name *</Label>
              <Input
                id="programName"
                {...register('programName', { required: 'Program name is required' })}
                placeholder="e.g., Crown & Anchor Society"
              />
              {errors.programName && (
                <p className="text-xs text-red-600">{errors.programName.message}</p>
              )}
            </div>
          )}

          {/* Membership Number */}
          <div className="space-y-2">
            <Label htmlFor="membershipNumber">Membership Number *</Label>
            <Input
              id="membershipNumber"
              {...register('membershipNumber', { required: 'Membership number is required' })}
              placeholder="e.g., 387469722"
            />
            {errors.membershipNumber && (
              <p className="text-xs text-red-600">{errors.membershipNumber.message}</p>
            )}
          </div>

          {/* Tier Level */}
          <div className="space-y-2">
            <Label htmlFor="tierLevel">Tier Level (optional)</Label>
            <Input
              id="tierLevel"
              {...register('tierLevel')}
              placeholder="e.g., Diamond Plus, Gold, Platinum"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Add any additional notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createLoyaltyProgram.isPending || updateLoyaltyProgram.isPending}
            >
              {createLoyaltyProgram.isPending || updateLoyaltyProgram.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                <>{isEditing ? 'Update' : 'Add'} Program</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
