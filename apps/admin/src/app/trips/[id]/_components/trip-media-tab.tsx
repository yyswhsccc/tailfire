'use client'

/**
 * Trip Media Tab Component
 *
 * Displays and manages trip-level media including cover photos and gallery images.
 * Uses the shared MediaUploader component for Unsplash integration.
 */

import { useState, useCallback } from 'react'
import {
  ImageIcon,
  Plus,
  Trash2,
  Star,
  StarOff,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
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
import { tripMediaKeys } from '@/hooks/use-trip-media'
import { useToast } from '@/hooks/use-toast'
import {
  useTripMedia,
  useSetTripCoverPhoto,
  useRemoveTripCoverPhoto,
  useDeleteTripMedia,
} from '@/hooks/use-trip-media'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import type { TripMediaResponseDto } from '@tailfire/shared-types/api'

interface TripMediaTabProps {
  trip: TripResponseDto
}

export function TripMediaTab({ trip }: TripMediaTabProps) {
  const { toast } = useToast()
  const [showAddMediaDialog, setShowAddMediaDialog] = useState(false)
  const [deleteMediaId, setDeleteMediaId] = useState<string | null>(null)
  const [uploadAsCover, setUploadAsCover] = useState(false)

  // Queries
  const { data: media = [], isLoading } = useTripMedia(trip.id)

  // Mutations
  const setCoverPhoto = useSetTripCoverPhoto(trip.id)
  const removeCoverPhoto = useRemoveTripCoverPhoto(trip.id)
  const deleteMedia = useDeleteTripMedia(trip.id)

  // Get cover photo from media list
  const coverPhoto = media.find((m) => m.isCoverPhoto)
  const galleryPhotos = media.filter((m) => !m.isCoverPhoto)

  // Handle set as cover
  const handleSetCover = useCallback(
    async (mediaId: string) => {
      try {
        await setCoverPhoto.mutateAsync(mediaId)
        toast({
          title: 'Cover photo updated',
          description: 'The selected image is now the cover photo',
        })
      } catch (error) {
        toast({
          title: 'Failed to set cover',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [setCoverPhoto, toast]
  )

  // Handle remove cover
  const handleRemoveCover = useCallback(
    async (mediaId: string) => {
      try {
        await removeCoverPhoto.mutateAsync(mediaId)
        toast({
          title: 'Cover photo removed',
          description: 'The image is no longer the cover photo',
        })
      } catch (error) {
        toast({
          title: 'Failed to remove cover',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [removeCoverPhoto, toast]
  )

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteMediaId) return

    try {
      await deleteMedia.mutateAsync(deleteMediaId)
      toast({
        title: 'Media deleted',
        description: 'The image has been removed from this trip',
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
      {/* Cover Photo Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ash-900">Cover Photo</h2>
              <p className="text-sm text-ash-600">
                The main image displayed for this trip
              </p>
            </div>
            <Button
              onClick={() => {
                setUploadAsCover(true)
                setShowAddMediaDialog(true)
              }}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              {coverPhoto ? 'Change Cover' : 'Add Cover'}
            </Button>
          </div>

          {coverPhoto ? (
            <div className="relative group">
              <div className="aspect-[3/1] max-h-48 overflow-hidden rounded-lg border border-ash-200">
                <img
                  src={coverPhoto.fileUrl}
                  alt={coverPhoto.caption || 'Trip cover photo'}
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Attribution for Unsplash photos */}
              {coverPhoto.attribution?.source === 'unsplash' && (
                <div className="mt-2 text-xs text-ash-500">
                  Photo by{' '}
                  <a
                    href={`${coverPhoto.attribution.photographerUrl}?utm_source=tailfire&utm_medium=referral`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-ash-700"
                  >
                    {coverPhoto.attribution.photographerName}
                  </a>
                  {' on '}
                  <a
                    href="https://unsplash.com/?utm_source=tailfire&utm_medium=referral"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-ash-700"
                  >
                    Unsplash
                  </a>
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
                  onClick={() => handleRemoveCover(coverPhoto.id)}
                  disabled={removeCoverPhoto.isPending}
                >
                  <StarOff className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 w-8 p-0"
                  onClick={() => setDeleteMediaId(coverPhoto.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="aspect-[3/1] max-h-48 rounded-lg border-2 border-dashed border-ash-300 flex items-center justify-center bg-ash-50">
              <div className="text-center">
                <ImageIcon className="h-12 w-12 text-ash-300 mx-auto mb-2" />
                <p className="text-sm text-ash-500">No cover photo set</p>
                <p className="text-xs text-ash-400 mt-1">
                  Add a cover photo to make this trip stand out
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Gallery Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ash-900">Gallery</h2>
              <p className="text-sm text-ash-600">
                Additional photos for this trip
              </p>
            </div>
            <Button
              onClick={() => {
                setUploadAsCover(false)
                setShowAddMediaDialog(true)
              }}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Photo
            </Button>
          </div>

          {galleryPhotos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {galleryPhotos.map((photo) => (
                <MediaCard
                  key={photo.id}
                  media={photo}
                  onSetCover={handleSetCover}
                  onDelete={(id) => setDeleteMediaId(id)}
                  isSettingCover={setCoverPhoto.isPending}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ImageIcon className="h-6 w-6" />}
              title="No gallery photos"
              description="Add photos to create a gallery for this trip"
              action={{
                label: 'Add Photo',
                onClick: () => {
                  setUploadAsCover(false)
                  setShowAddMediaDialog(true)
                },
              }}
            />
          )}
        </div>
      </Card>

      {/* Add Media Dialog - Uses MediaUploader with Unsplash integration */}
      <Dialog
        open={showAddMediaDialog}
        onOpenChange={(open) => {
          setShowAddMediaDialog(open)
          if (!open) setUploadAsCover(false)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {uploadAsCover ? 'Set Cover Photo' : 'Add Photo'}
            </DialogTitle>
            <DialogDescription>
              {uploadAsCover
                ? 'Upload an image or search Unsplash to set as the cover photo'
                : 'Upload an image or search Unsplash to add to the gallery'}
            </DialogDescription>
          </DialogHeader>

          <MediaUploader
            apiEndpoint={`/trips/${trip.id}/media`}
            externalEndpoint={`/trips/${trip.id}/media/external`}
            allowedTypes={['image']}
            showStockPhotos={true}
            setAsCover={uploadAsCover}
            hideMediaGrid={true}
            queryKey={tripMediaKeys.list(trip.id)}
            onMediaChange={() => {
              // Close dialog after successful upload
              setShowAddMediaDialog(false)
              setUploadAsCover(false)
              toast({
                title: uploadAsCover ? 'Cover photo set' : 'Photo added',
                description: uploadAsCover
                  ? 'Cover photo has been updated'
                  : 'Photo has been added to the gallery',
              })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteMediaId} onOpenChange={(open) => !open && setDeleteMediaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the photo from this trip.
              This action cannot be undone.
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
  media: TripMediaResponseDto
  onSetCover: (id: string) => void
  onDelete: (id: string) => void
  isSettingCover: boolean
}

function MediaCard({ media, onSetCover, onDelete, isSettingCover }: MediaCardProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-ash-200">
      <img
        src={media.fileUrl}
        alt={media.caption || 'Trip photo'}
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
          variant="secondary"
          className="h-7 w-7 p-0 bg-white/90 hover:bg-white"
          onClick={() => onSetCover(media.id)}
          disabled={isSettingCover}
          title="Set as cover photo"
        >
          <Star className="h-3.5 w-3.5" />
        </Button>
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
