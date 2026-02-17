'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { useRelationships, useDeleteRelationship } from '@/hooks/use-relationships'
import { useToast } from '@/hooks/use-toast'
import { getRelationshipCategoryColor, getRelationshipCategoryLabel } from '@/lib/relationship-constants'
import type { ContactRelationshipResponseDto } from '@tailfire/shared-types/api'

interface RelationshipsSectionProps {
  contactId: string
  onAddRelationship: () => void
  onEditRelationship: (relationship: ContactRelationshipResponseDto) => void
}

function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function RelationshipsSection({
  contactId,
  onAddRelationship,
  onEditRelationship,
}: RelationshipsSectionProps) {
  const { data: relationships, isLoading } = useRelationships(contactId)
  const deleteRelationship = useDeleteRelationship()
  const { toast } = useToast()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [relationshipToDelete, setRelationshipToDelete] = useState<ContactRelationshipResponseDto | null>(null)

  const handleDeleteClick = (relationship: ContactRelationshipResponseDto) => {
    setRelationshipToDelete(relationship)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!relationshipToDelete) return

    try {
      await deleteRelationship.mutateAsync({
        contactId,
        relationshipId: relationshipToDelete.id,
      })

      toast({
        title: 'Relationship deleted',
        description: 'The relationship has been successfully removed.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete relationship. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleteDialogOpen(false)
      setRelationshipToDelete(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-phoenix-gold-600"></div>
      </div>
    )
  }

  if (!relationships || relationships.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="rounded-full bg-ash-100 p-4 mb-4">
          <Users className="h-8 w-8 text-ash-400" />
        </div>
        <h3 className="text-lg font-semibold text-ash-900 mb-2">No Relationships</h3>
        <p className="text-sm text-ash-600 text-center max-w-md mb-6">
          Track relationships between contacts like family members, business partners, or travel companions.
        </p>
        <Button onClick={onAddRelationship} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Relationship
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ash-900">
          Relationships ({relationships.length})
        </h2>
        <Button onClick={onAddRelationship} size="sm" className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Relationship
        </Button>
      </div>

      <div className="grid gap-4">
        {relationships.map((relationship) => {
          const relatedContact = relationship.relatedContact
          const displayName = relatedContact?.displayName || 'Unknown Contact'
          const label = relationship.labelForContact1 || relationship.labelForContact2 || 'Related to'

          return (
            <Card key={relationship.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-phoenix-gold-100 text-phoenix-gold-700 font-semibold">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-ash-900 truncate">
                        {displayName}
                      </h3>
                      <Badge
                        variant="outline"
                        className={getRelationshipCategoryColor(relationship.category)}
                      >
                        {getRelationshipCategoryLabel(relationship.category)}
                      </Badge>
                    </div>

                    <p className="text-sm text-ash-600 mb-2">{label}</p>

                    {relationship.notes && (
                      <p className="text-sm text-ash-500 line-clamp-2">{relationship.notes}</p>
                    )}

                    {relatedContact && (
                      <div className="flex gap-4 mt-2 text-xs text-ash-500">
                        {relatedContact.email && (
                          <span className="truncate">{relatedContact.email}</span>
                        )}
                        {relatedContact.phone && (
                          <span>{relatedContact.phone}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditRelationship(relationship)}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(relationship)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Relationship</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this relationship? This action cannot be undone.
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
