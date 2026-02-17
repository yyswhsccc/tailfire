'use client'

import { useEffect } from 'react'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateLoyaltyProgram, useUpdateLoyaltyProgram } from '@/hooks/use-loyalty-programs'
import { useToast } from '@/hooks/use-toast'
import type { LoyaltyProgramDto } from '@tailfire/shared-types/api'

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

const COMMON_PROVIDERS = [
  'Royal Caribbean',
  'Celebrity Cruises',
  'Norwegian Cruise Line',
  'Carnival Cruise Line',
  'Princess Cruises',
  'Holland America Line',
  'MSC Cruises',
  'Disney Cruise Line',
  'Viking',
  'Cunard',
  'Air Canada',
  'WestJet',
  'United Airlines',
  'Delta Air Lines',
  'American Airlines',
  'Marriott Bonvoy',
  'Hilton Honors',
  'IHG One Rewards',
  'World of Hyatt',
] as const

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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<LoyaltyProgramFormData>({
    defaultValues: {
      providerName: loyaltyProgram?.providerName || '',
      programName: loyaltyProgram?.programName || '',
      membershipNumber: loyaltyProgram?.membershipNumber || '',
      tierLevel: loyaltyProgram?.tierLevel || '',
      notes: loyaltyProgram?.notes || '',
    },
  })

  const providerName = watch('providerName')

  useEffect(() => {
    if (open) {
      reset({
        providerName: loyaltyProgram?.providerName || '',
        programName: loyaltyProgram?.programName || '',
        membershipNumber: loyaltyProgram?.membershipNumber || '',
        tierLevel: loyaltyProgram?.tierLevel || '',
        notes: loyaltyProgram?.notes || '',
      })
    }
  }, [open, loyaltyProgram, reset])

  const onSubmit = async (data: LoyaltyProgramFormData) => {
    try {
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
          {/* Provider Name */}
          <div className="space-y-2">
            <Label htmlFor="providerName">Provider *</Label>
            <Select
              value={COMMON_PROVIDERS.includes(providerName as any) ? providerName : '__custom'}
              onValueChange={(value) => {
                if (value !== '__custom') {
                  setValue('providerName', value, { shouldDirty: true })
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select or type a provider" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
            {(!COMMON_PROVIDERS.includes(providerName as any) || providerName === '') && (
              <Input
                id="providerName"
                {...register('providerName', { required: 'Provider is required' })}
                placeholder="e.g., Silversea Cruises"
              />
            )}
            {errors.providerName && (
              <p className="text-xs text-red-600">{errors.providerName.message}</p>
            )}
          </div>

          {/* Program Name */}
          <div className="space-y-2">
            <Label htmlFor="programName">Program Name *</Label>
            <Input
              id="programName"
              {...register('programName', { required: 'Program name is required' })}
              placeholder="e.g., Crown & Anchor Society, Aeroplan"
            />
            {errors.programName && (
              <p className="text-xs text-red-600">{errors.programName.message}</p>
            )}
          </div>

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
