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
import {
  useCreateLoyaltyProgramCatalog,
  useUpdateLoyaltyProgramCatalog,
} from '@/hooks/use-loyalty-programs-catalog'
import { useToast } from '@/hooks/use-toast'
import type { LoyaltyProgramCatalogDto, LoyaltyProgramType } from '@tailfire/shared-types/api'

interface LoyaltyProgramCatalogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  program?: LoyaltyProgramCatalogDto | null
}

interface FormData {
  providerName: string
  programName: string
  programType: LoyaltyProgramType
  websiteUrl: string
  notes: string
}

export function LoyaltyProgramCatalogDialog({
  open,
  onOpenChange,
  program,
}: LoyaltyProgramCatalogDialogProps) {
  const isEditing = !!program
  const { toast } = useToast()
  const createMutation = useCreateLoyaltyProgramCatalog()
  const updateMutation = useUpdateLoyaltyProgramCatalog()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      providerName: '',
      programName: '',
      programType: 'cruise',
      websiteUrl: '',
      notes: '',
    },
  })

  const programType = watch('programType')

  useEffect(() => {
    if (open) {
      reset({
        providerName: program?.providerName || '',
        programName: program?.programName || '',
        programType: (program?.programType as LoyaltyProgramType) || 'cruise',
        websiteUrl: program?.websiteUrl || '',
        notes: program?.notes || '',
      })
    }
  }, [open, program, reset])

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditing && program) {
        await updateMutation.mutateAsync({
          id: program.id,
          data: {
            providerName: data.providerName,
            programName: data.programName,
            programType: data.programType,
            websiteUrl: data.websiteUrl || undefined,
            notes: data.notes || undefined,
          },
        })
        toast({
          title: 'Program updated',
          description: 'The loyalty program has been updated.',
        })
      } else {
        await createMutation.mutateAsync({
          providerName: data.providerName,
          programName: data.programName,
          programType: data.programType,
          websiteUrl: data.websiteUrl || undefined,
          notes: data.notes || undefined,
        })
        toast({
          title: 'Program created',
          description: 'The loyalty program has been added to your catalog.',
        })
      }
      onOpenChange(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.'
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'create'} program. ${errorMessage}`,
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
              ? 'Update the details of this loyalty program.'
              : 'Add a new loyalty program to your agency catalog.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="providerName">Provider Name *</Label>
            <Input
              id="providerName"
              {...register('providerName', { required: 'Provider name is required' })}
              placeholder="e.g., Royal Caribbean"
            />
            {errors.providerName && (
              <p className="text-xs text-red-600">{errors.providerName.message}</p>
            )}
          </div>

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

          <div className="space-y-2">
            <Label>Program Type *</Label>
            <Select
              value={programType}
              onValueChange={(value) => setValue('programType', value as LoyaltyProgramType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cruise">Cruise</SelectItem>
                <SelectItem value="airline">Airline</SelectItem>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL (optional)</Label>
            <Input
              id="websiteUrl"
              {...register('websiteUrl')}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Additional information..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>{isEditing ? 'Update' : 'Create'} Program</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
