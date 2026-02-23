'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLoyaltyPrograms, useDeleteLoyaltyProgram } from '@/hooks/use-loyalty-programs'
import { useToast } from '@/hooks/use-toast'
import type { LoyaltyProgramDto } from '@tailfire/shared-types/api'

interface LoyaltyProgramsSectionProps {
  contactId: string
  onAdd: () => void
  onEdit: (program: LoyaltyProgramDto) => void
}

export function LoyaltyProgramsSection({
  contactId,
  onAdd,
  onEdit,
}: LoyaltyProgramsSectionProps) {
  const { data: programs, isLoading } = useLoyaltyPrograms(contactId)
  const deleteLoyaltyProgram = useDeleteLoyaltyProgram()
  const { toast } = useToast()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [programToDelete, setProgramToDelete] = useState<LoyaltyProgramDto | null>(null)

  const handleDeleteClick = (program: LoyaltyProgramDto) => {
    setProgramToDelete(program)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!programToDelete) return

    try {
      await deleteLoyaltyProgram.mutateAsync({
        contactId,
        programId: programToDelete.id,
      })

      toast({
        title: 'Loyalty program deleted',
        description: 'The loyalty program has been successfully removed.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete loyalty program. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleteDialogOpen(false)
      setProgramToDelete(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-phoenix-gold-600"></div>
      </div>
    )
  }

  if (!programs || programs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="rounded-full bg-ash-100 p-4 mb-4">
          <Award className="h-8 w-8 text-ash-400" />
        </div>
        <h3 className="text-lg font-semibold text-ash-900 mb-2">No Loyalty Programs</h3>
        <p className="text-sm text-ash-600 text-center max-w-md mb-6">
          Track loyalty and rewards program memberships like airline miles, cruise line rewards, and hotel points.
        </p>
        <Button onClick={onAdd} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Loyalty Program
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ash-900">
          Loyalty Programs ({programs.length})
        </h2>
        <Button onClick={onAdd} size="sm" className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Program
        </Button>
      </div>

      <div className="grid gap-4">
        {programs.map((program) => (
          <Card key={program.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="rounded-full bg-phoenix-gold-100 p-2">
                  <Award className="h-5 w-5 text-phoenix-gold-700" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-ash-900 truncate">
                      {program.providerName}
                    </h3>
                    {program.tierLevel && (
                      <Badge variant="outline" className="text-phoenix-gold-700 border-phoenix-gold-300">
                        {program.tierLevel}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-ash-600 mb-1">{program.programName}</p>
                  <p className="text-sm text-ash-500 font-mono">{program.membershipNumber}</p>

                  {program.notes && (
                    <p className="text-sm text-ash-500 line-clamp-2 mt-2">{program.notes}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(program)}
                  className="h-8 w-8 p-0"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(program)}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loyalty Program</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this loyalty program? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
