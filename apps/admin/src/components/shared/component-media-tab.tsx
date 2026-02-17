'use client'

/**
 * Component Media Tab
 *
 * Shared media gallery tab for component-level media (activities, accommodations, flights, etc.)
 * No cover photo feature - just a simple gallery with add/delete functionality.
 */

import { useState, useCallback } from 'react'
import { ImageIcon, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from './empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { MediaUploader } from '@/components/media-uploader'
import { useToast } from '@/hooks/use-toast'
import {
  useComponentMedia,
  useDeleteComponentMedia,
  componentMediaKeys,
  type ComponentEntityType,
  type ComponentMediaDto,
} from '@/hooks/use-component-media'
import { itineraryDayKeys } from '@/hooks/use-itinerary-days'

export interface ComponentMediaTabProps {
  /** The component ID to load media for */
  componentId: string
  /** The entity type for API scoping */
  entityType: ComponentEntityType
  /** Optional itinerary ID to invalidate thumbnail cache when media changes */
  itineraryId?: string
  /** Optional title for the section (defaults to "Photos") */
  title?: string
  /** Optional description text */
  description?: string
  /** Whether to show Unsplash stock photos option */
  showStockPhotos?: boolean
}

export function ComponentMediaTab({
  componentId,
  entityType,
  itineraryId,
  title = 'Photos',
  description = 'Images for this item',
  showStockPhotos = true,
}: ComponentMediaTabProps) {
  const { toast } = useToast()
  const [showAddMediaDialog, setShowAddMediaDialog] = useState(false)
  const [deleteMediaId, setDeleteMediaId] = useState<string | null>(null)

  // Queries
  const { data: media = [], isLoading } = useComponentMedia(componentId, entityType)

  // Mutations
  const deleteMedia = useDeleteComponentMedia(componentId, entityType, itineraryId)

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteMediaId) return

    try {
      await deleteMedia.mutateAsync(deleteMediaId)
      toast({
        title: 'Photo deleted',
        description: 'The image has been removed',
      })
      setDeleteMediaId(null)
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [deleteMediaId, deleteMedia, toast])

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400 mx-auto mb-4" />
          <p className="text-ash-500">Loading media...</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Gallery Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ash-900">{title}</h2>
              <p className="text-sm text-ash-600">{description}</p>
            </div>
            <Button onClick={() => setShowAddMediaDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Photo
            </Button>
          </div>

          {media.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {media.map((photo) => (
                <MediaCard
                  key={photo.id}
                  media={photo}
                  onDelete={(id) => setDeleteMediaId(id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ImageIcon className="h-6 w-6" />}
              title="No photos yet"
              description="Add photos to enhance this item"
              action={{
                label: 'Add Photo',
                onClick: () => setShowAddMediaDialog(true),
              }}
            />
          )}
        </div>
      </Card>

      {/* Add Media Dialog */}
      <Dialog open={showAddMediaDialog} onOpenChange={setShowAddMediaDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Photo</DialogTitle>
            <DialogDescription>
              Upload an image or search Unsplash to add a photo
            </DialogDescription>
          </DialogHeader>

          <MediaUploader
            apiEndpoint={`/components/${componentId}/media?entityType=${entityType}`}
            externalEndpoint={`/components/${componentId}/media/external?entityType=${entityType}`}
            allowedTypes={['image']}
            showStockPhotos={showStockPhotos}
            setAsCover={false}
            hideMediaGrid={true}
            queryKey={componentMediaKeys.list(componentId, entityType)}
            additionalQueryKeys={itineraryId ? [itineraryDayKeys.withActivities(itineraryId)] : []}
            onMediaChange={() => {
              setShowAddMediaDialog(false)
              toast({
                title: 'Photo added',
                description: 'Photo has been added successfully',
              })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteMediaId}
        onOpenChange={(open) => !open && setDeleteMediaId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the photo. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMedia.isPending}
            >
              {deleteMedia.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Individual Media Card Component
 */
interface MediaCardProps {
  media: ComponentMediaDto
  onDelete: (id: string) => void
}

function MediaCard({ media, onDelete }: MediaCardProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-ash-200">
      <img
        src={media.fileUrl}
        alt={media.caption || 'Photo'}
        className="h-full w-full object-cover"
      />

      {/* Attribution overlay */}
      {media.attribution?.source === 'unsplash' && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white truncate">
            Photo by {media.attribution.photographerName}
          </p>
        </div>
      )}

      {/* Caption */}
      {media.caption && !media.attribution && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white truncate">{media.caption}</p>
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 w-7 p-0"
          onClick={() => onDelete(media.id)}
          title="Delete photo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
