'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Plus, Check, MoreVertical, Trash2, Pencil, FileText, Send, CheckCircle2, Archive, Library, Download, Globe, History, Copy, Star } from 'lucide-react'
import type { ItineraryResponseDto } from '@tailfire/shared-types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useLoading } from '@/context/loading-context'
import { useDeleteItinerary, useSelectItinerary, useUpdateItineraryStatus, useDuplicateItinerary, type ItineraryStatus } from '@/hooks/use-itineraries'
import { usePublishItinerary } from '@/hooks/use-itinerary-versions'
import { cn } from '@/lib/utils'
import { FOCUS_VISIBLE_RING, SKELETON_BG } from '@/lib/itinerary-styles'
import { EditItineraryDialog } from './edit-itinerary-dialog'
import { SaveAsTemplateDialog } from './save-as-template-dialog'
import { ItineraryVersionHistory } from './itinerary-version-history'

interface ItinerarySelectorProps {
  tripId: string
  tripStartDate?: string | null
  tripEndDate?: string | null
  itineraries: ItineraryResponseDto[]
  selectedItinerary: ItineraryResponseDto | null
  onSelectItinerary: (itinerary: ItineraryResponseDto) => void
  onCreateClick: () => void
  isLoading?: boolean
  /** Hide the Create and Import buttons (e.g., on Bookings page where they're not needed) */
  hideActionButtons?: boolean
  /** ID of the itinerary the client selected (from trip.clientSelectedItineraryId) */
  clientSelectedItineraryId?: string | null
}

/**
 * Itinerary Selector Component
 *
 * Matches TERN's pattern with:
 * - Horizontal list of itinerary options
 * - Visual indicator for selected itinerary
 * - "Create Itinerary" button
 * - Shows itinerary names (e.g., "Option 1", "Option 2")
 */
export function ItinerarySelector({
  tripId,
  tripStartDate,
  tripEndDate,
  itineraries,
  selectedItinerary,
  onSelectItinerary,
  onCreateClick,
  isLoading = false,
  hideActionButtons = false,
  clientSelectedItineraryId,
}: ItinerarySelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const { startLoading } = useLoading()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itineraryToDelete, setItineraryToDelete] = useState<ItineraryResponseDto | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [itineraryToEdit, setItineraryToEdit] = useState<ItineraryResponseDto | null>(null)
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false)
  const [itineraryToSave, setItineraryToSave] = useState<ItineraryResponseDto | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [itineraryToPublish, setItineraryToPublish] = useState<ItineraryResponseDto | null>(null)
  const [publishChangeSummary, setPublishChangeSummary] = useState('')
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [versionHistoryItineraryId, setVersionHistoryItineraryId] = useState<string | undefined>()

  const deleteItinerary = useDeleteItinerary(tripId)
  const selectItinerary = useSelectItinerary(tripId)
  const updateStatus = useUpdateItineraryStatus(tripId)
  const publishItinerary = usePublishItinerary(tripId)
  const duplicateItinerary = useDuplicateItinerary(tripId)

  // Status labels for toast messages
  const STATUS_LABELS: Record<ItineraryStatus, string> = {
    draft: 'Draft',
    proposing: 'Proposing',
    approved: 'Approved',
    archived: 'Archived',
  }

  const handleStatusChange = async (itinerary: ItineraryResponseDto, status: ItineraryStatus) => {
    try {
      await updateStatus.mutateAsync({ id: itinerary.id, status })
      toast({
        title: 'Status Updated',
        description: `"${itinerary.name}" marked as ${STATUS_LABELS[status]}.`,
      })
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Failed to update status. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmDelete = async () => {
    if (!itineraryToDelete) return

    try {
      // If deleting the selected itinerary, select another first
      if (selectedItinerary?.id === itineraryToDelete.id) {
        const otherItinerary = itineraries.find(it => it.id !== itineraryToDelete.id)
        if (otherItinerary) {
          await selectItinerary.mutateAsync(otherItinerary.id)
          onSelectItinerary(otherItinerary)
        }
      }

      await deleteItinerary.mutateAsync(itineraryToDelete.id)
      toast({
        title: 'Itinerary Deleted',
        description: `"${itineraryToDelete.name}" has been deleted.`,
      })
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete itinerary. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleteDialogOpen(false)
      setItineraryToDelete(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 pb-2 border-b border-ash-200" role="status" aria-label="Loading itinerary options">
        <div className={cn('h-8 w-24 rounded animate-pulse', SKELETON_BG)} />
        <div className={cn('h-8 w-24 rounded animate-pulse', SKELETON_BG)} />
        <div className={cn('h-8 w-8 rounded animate-pulse', SKELETON_BG)} />
      </div>
    )
  }

  // If no itineraries exist, show create prompt
  if (!itineraries || itineraries.length === 0) {
    return (
      <div className="pb-2 border-b border-ash-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-ash-900">Itinerary Options</h3>
            <p className="text-xs text-ash-500">
              Create your first itinerary or import from the library
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onCreateClick}
              aria-label="Create first itinerary"
              className={cn('bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white h-8 px-3', FOCUS_VISIBLE_RING)}
              size="sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create
            </Button>
            <Button
              onClick={() => {
                startLoading('itinerary-templates')
                const params = new URLSearchParams({
                  tripId,
                  returnUrl: pathname,
                })
                if (tripStartDate) params.append('tripStartDate', tripStartDate)
                if (tripEndDate) params.append('tripEndDate', tripEndDate)
                router.push(`/library/itineraries?${params.toString()}`)
              }}
              variant="outline"
              size="sm"
              aria-label="Import itinerary from library"
              className={cn('h-8 px-3', FOCUS_VISIBLE_RING)}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Import
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Itinerary Options - Simple horizontal bar */}
      <div
        role="radiogroup"
        aria-label="Itinerary options"
        className="flex items-center gap-2 flex-wrap"
      >
        {itineraries.map((itinerary) => {
          const isSelected = selectedItinerary?.id === itinerary.id
          const isDraft = itinerary.status === 'draft'
          const isProposing = itinerary.status === 'proposing'
          const isApproved = itinerary.status === 'approved'
          const isArchived = itinerary.status === 'archived'
          const isClientPick = clientSelectedItineraryId === itinerary.id

          return (
            <div key={itinerary.id} className="relative group flex items-center">
              <button
                role="radio"
                aria-checked={isSelected}
                aria-label={`${itinerary.name}${isDraft ? ', draft' : ''}${isProposing ? ', proposing' : ''}${isApproved ? ', approved' : ''}${isArchived ? ', archived' : ''}${isSelected ? ', selected' : ''}`}
                onClick={() => onSelectItinerary(itinerary)}
                className={cn(
                  'px-2.5 py-1 rounded-md border transition-all flex items-center gap-1.5',
                  'hover:border-phoenix-gold-400 hover:bg-phoenix-gold-50',
                  FOCUS_VISIBLE_RING,
                  isSelected
                    ? 'border-phoenix-gold-500 bg-phoenix-gold-50 text-phoenix-gold-900'
                    : 'border-ash-200 bg-white text-ash-900',
                  isArchived && 'opacity-60'
                )}
              >
                {/* Check icon for selected */}
                {isSelected && (
                  <Check className="h-3 w-3 text-phoenix-gold-600" />
                )}

                {/* Itinerary Name */}
                <span className="font-medium text-xs">
                  {itinerary.name}
                </span>

                {/* Status Badge */}
                {isDraft && (
                  <Badge variant="inbound">
                    Draft
                  </Badge>
                )}
                {isProposing && (
                  <Badge variant="planning">
                    Proposing
                  </Badge>
                )}
                {isApproved && (
                  <Badge variant="completed">
                    Approved
                  </Badge>
                )}
                {isArchived && (
                  <Badge variant="secondary">
                    Archived
                  </Badge>
                )}

                {isClientPick && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600" title="Client's selection">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  </span>
                )}

                {itinerary.hasUnpublishedChanges && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0" title="Unpublished changes" />
                )}

              </button>

              {/* Overflow Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 w-6 p-0 ml-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity',
                      FOCUS_VISIBLE_RING
                    )}
                    aria-label={`${itinerary.name} actions`}
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setItineraryToEdit(itinerary)
                      setEditDialogOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setItineraryToSave(itinerary)
                      setSaveTemplateDialogOpen(true)
                    }}
                  >
                    <Library className="h-4 w-4 mr-2" />
                    Save as Template
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      try {
                        const result = await duplicateItinerary.mutateAsync(itinerary.id)
                        toast({
                          title: 'Duplicated',
                          description: `"${result.name}" created.`,
                        })
                        onSelectItinerary(result)
                      } catch {
                        toast({
                          title: 'Duplicate Failed',
                          description: 'Could not duplicate itinerary. Please try again.',
                          variant: 'destructive',
                        })
                      }
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>

                  {(itinerary.status === 'proposing' || itinerary.status === 'approved') && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          setItineraryToPublish(itinerary)
                          setPublishChangeSummary('')
                          setPublishDialogOpen(true)
                        }}
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Publish to Client
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuItem
                    onSelect={() => {
                      setVersionHistoryItineraryId(itinerary.id)
                      setVersionHistoryOpen(true)
                    }}
                  >
                    <History className="h-4 w-4 mr-2" />
                    Version History
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Status Transitions */}
                  {!isDraft && (
                    <DropdownMenuItem
                      onSelect={() => handleStatusChange(itinerary, 'draft')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Mark as Draft
                    </DropdownMenuItem>
                  )}
                  {!isProposing && (
                    <DropdownMenuItem
                      onSelect={() => handleStatusChange(itinerary, 'proposing')}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Mark as Proposing
                    </DropdownMenuItem>
                  )}
                  {!isApproved && (
                    <DropdownMenuItem
                      onSelect={() => handleStatusChange(itinerary, 'approved')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Approved
                    </DropdownMenuItem>
                  )}
                  {!isArchived && (
                    <DropdownMenuItem
                      onSelect={() => handleStatusChange(itinerary, 'archived')}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={() => {
                      // Guard: Cannot delete the last itinerary
                      if (itineraries.length <= 1) {
                        toast({
                          title: 'Cannot Delete',
                          description: 'At least one itinerary is required.',
                          variant: 'destructive',
                        })
                        return
                      }
                      // Guard: Cannot delete an approved itinerary
                      if (isApproved) {
                        toast({
                          title: 'Cannot Delete',
                          description: 'Cannot delete an approved itinerary. Archive it first.',
                          variant: 'destructive',
                        })
                        return
                      }
                      setItineraryToDelete(itinerary)
                      setDeleteDialogOpen(true)
                    }}
                    className={cn(
                      'text-destructive focus:text-destructive',
                      isApproved && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}

        {/* Inline Create Button - hidden on Bookings page */}
        {!hideActionButtons && (
          <Button
            onClick={onCreateClick}
            variant="ghost"
            size="sm"
            aria-label="Create new itinerary"
            className={cn('h-7 px-2 text-xs text-ash-500 hover:text-ash-900', FOCUS_VISIBLE_RING)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create
          </Button>
        )}

        {/* Import from Library Button - hidden on Bookings page */}
        {!hideActionButtons && (
          <Button
            onClick={() => {
              startLoading('itinerary-templates')
              const params = new URLSearchParams({
                tripId,
                returnUrl: pathname,
              })
              if (tripStartDate) params.append('tripStartDate', tripStartDate)
              if (tripEndDate) params.append('tripEndDate', tripEndDate)
              router.push(`/library/itineraries?${params.toString()}`)
            }}
            variant="ghost"
            size="sm"
            aria-label="Import itinerary from library"
            className={cn('h-7 px-2 text-xs text-ash-500 hover:text-ash-900', FOCUS_VISIBLE_RING)}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Import
          </Button>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{itineraryToDelete?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this itinerary and all its days and activities. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Itinerary Dialog */}
      <EditItineraryDialog
        tripId={tripId}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        itinerary={itineraryToEdit}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          setItineraryToEdit(null)
        }}
      />

      {/* Save as Template Dialog */}
      <SaveAsTemplateDialog
        type="itinerary"
        itemId={itineraryToSave?.id || null}
        defaultName={itineraryToSave?.name}
        open={saveTemplateDialogOpen}
        onOpenChange={setSaveTemplateDialogOpen}
        onSuccess={() => {
          toast({
            title: 'Template Saved',
            description: `"${itineraryToSave?.name}" has been saved to your library.`,
          })
          setItineraryToSave(null)
        }}
      />

      {/* Publish to Client Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Publish v{(itineraryToPublish?.currentVersion ?? 0) + 1} to Client
            </DialogTitle>
            <DialogDescription>
              This will create a snapshot of &quot;{itineraryToPublish?.name}&quot; visible to clients on the shared proposal link.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="What changed? (optional)"
              value={publishChangeSummary}
              onChange={(e) => setPublishChangeSummary(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!itineraryToPublish) return
                try {
                  const result = await publishItinerary.mutateAsync({
                    itineraryId: itineraryToPublish.id,
                    changeSummary: publishChangeSummary || undefined,
                  })
                  toast({
                    title: 'Published',
                    description: `v${result.versionNumber} is now live for clients.`,
                  })
                  setPublishDialogOpen(false)
                  setItineraryToPublish(null)
                } catch {
                  toast({
                    title: 'Publish Failed',
                    description: 'Failed to publish. Please try again.',
                    variant: 'destructive',
                  })
                }
              }}
              disabled={publishItinerary.isPending}
            >
              {publishItinerary.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Sheet */}
      <ItineraryVersionHistory
        tripId={tripId}
        itineraryId={versionHistoryItineraryId}
        open={versionHistoryOpen}
        onOpenChange={setVersionHistoryOpen}
      />
    </div>
  )
}
