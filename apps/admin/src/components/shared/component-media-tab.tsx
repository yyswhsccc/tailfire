'use client'

/**
 * Component Media Tab
 *
 * Shared media gallery tab for component-level media (activities, accommodations, flights, etc.)
 * No cover photo feature - just a simple gallery with add/delete functionality.
 * Supports multi-select with Select All and batch delete.
 */

import { useState, useCallback } from 'react'
import { ImageIcon, Plus, Trash2, Loader2, CheckSquare, Square, XCircle, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  useDeleteBatchComponentMedia,
  useSetPrimaryComponentMedia,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)

  // Queries
  const { data: media = [], isLoading } = useComponentMedia(componentId, entityType)

  // Mutations
  const deleteMedia = useDeleteComponentMedia(componentId, entityType, itineraryId)
  const batchDeleteMedia = useDeleteBatchComponentMedia(componentId, entityType, itineraryId)
  const setPrimaryMedia = useSetPrimaryComponentMedia(componentId, entityType, itineraryId)

  const isSelecting = selectedIds.size > 0
  const allSelected = media.length > 0 && selectedIds.size === media.length

  // Toggle selection for a single item
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(media.map(m => m.id)))
    }
  }, [allSelected, media])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Handle single delete
  const handleDelete = useCallback(async () => {
    if (!deleteMediaId) return

    try {
      await deleteMedia.mutateAsync(deleteMediaId)
      toast({
        title: 'Photo deleted',
        description: 'The image has been removed',
      })
      setDeleteMediaId(null)
      // Remove from selection if it was selected
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(deleteMediaId)
        return next
      })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [deleteMediaId, deleteMedia, toast])

  // Handle batch delete
  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    try {
      await batchDeleteMedia.mutateAsync(ids)
      toast({
        title: `${ids.length} photo${ids.length > 1 ? 's' : ''} deleted`,
        description: 'The selected images have been removed',
      })
      setSelectedIds(new Set())
      setShowBatchDeleteConfirm(false)
    } catch (error) {
      toast({
        title: 'Batch delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [selectedIds, batchDeleteMedia, toast])

  // Handle set primary
  const handleSetPrimary = useCallback(async (id: string) => {
    try {
      await setPrimaryMedia.mutateAsync(id)
      toast({
        title: 'Primary image set',
        description: 'This image will be used as the thumbnail',
      })
    } catch (error) {
      toast({
        title: 'Failed to set primary image',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [setPrimaryMedia, toast])

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
            <div className="flex items-center gap-2">
              {media.length > 0 && (
                <>
                  {isSelecting && (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowBatchDeleteConfirm(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete {selectedIds.size}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                  >
                    {allSelected ? (
                      <>
                        <CheckSquare className="h-4 w-4 mr-2" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 mr-2" />
                        Select All
                      </>
                    )}
                  </Button>
                </>
              )}
              <Button onClick={() => setShowAddMediaDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Photo
              </Button>
            </div>
          </div>

          {media.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {media.map((photo, index) => (
                <MediaCard
                  key={photo.id}
                  media={photo}
                  isPrimary={index === 0}
                  selected={selectedIds.has(photo.id)}
                  isSelecting={isSelecting}
                  onToggleSelect={toggleSelect}
                  onSetPrimary={handleSetPrimary}
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

      {/* Single Delete Confirmation Dialog */}
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

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog
        open={showBatchDeleteConfirm}
        onOpenChange={setShowBatchDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Photo{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected photo{selectedIds.size > 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleteMedia.isPending}
            >
              {batchDeleteMedia.isPending ? 'Deleting...' : `Delete ${selectedIds.size} Photo${selectedIds.size > 1 ? 's' : ''}`}
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
  isPrimary: boolean
  selected: boolean
  isSelecting: boolean
  onToggleSelect: (id: string) => void
  onSetPrimary: (id: string) => void
  onDelete: (id: string) => void
}

function MediaCard({ media, isPrimary, selected, isSelecting, onToggleSelect, onSetPrimary, onDelete }: MediaCardProps) {
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors cursor-pointer ${
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : isPrimary
            ? 'border-amber-400 ring-1 ring-amber-200'
            : 'border-ash-200 hover:border-ash-300'
      }`}
      onClick={() => onToggleSelect(media.id)}
    >
      <img
        src={media.fileUrl}
        alt={media.caption || 'Photo'}
        className="h-full w-full object-cover"
      />

      {/* Primary badge - always visible on the primary image */}
      {isPrimary && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-amber-500 text-white rounded-full px-2 py-0.5 flex items-center gap-1 text-xs font-medium shadow-sm">
            <Star className="h-3 w-3 fill-current" />
            Primary
          </div>
        </div>
      )}

      {/* Selection checkbox - always visible when selecting, visible on hover otherwise */}
      <div className={`absolute top-2 left-2 transition-opacity ${
        isSelecting || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <div className="bg-white rounded shadow-sm p-0.5">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(media.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

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

      {/* Hover actions - only show when NOT in selection mode */}
      {!isSelecting && (
        <div className={`absolute ${isPrimary ? 'top-10' : 'top-2'} right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
          {!isPrimary && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 p-0 bg-white/90 hover:bg-amber-50"
              onClick={(e) => {
                e.stopPropagation()
                onSetPrimary(media.id)
              }}
              title="Set as primary image"
            >
              <Star className="h-3.5 w-3.5 text-amber-500" />
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(media.id)
            }}
            title="Delete photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
