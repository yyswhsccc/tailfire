'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  useTripGroups,
  useCreateTripGroup,
  useUpdateTripGroup,
  useDeleteTripGroup,
  useTripsByGroup,
  useUpdateTrip,
} from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import {
  FolderPlus,
  Check,
  Pencil,
  ChevronRight,
  Trash2,
  ArrowLeft,
  X,
  Loader2,
} from 'lucide-react'

interface MoveToGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  currentGroupId: string | null
}

export function MoveToGroupDialog({ open, onOpenChange, tripId, currentGroupId }: MoveToGroupDialogProps) {
  const { toast } = useToast()
  const { data: groups = [], isLoading } = useTripGroups()
  const createGroup = useCreateTripGroup()
  const updateGroup = useUpdateTripGroup()
  const deleteGroup = useDeleteTripGroup()
  const updateTrip = useUpdateTrip()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Inline rename state
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Expanded group view state
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  // Delete confirmation state
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setShowCreateForm(false)
      setNewGroupName('')
      setRenamingGroupId(null)
      setExpandedGroupId(null)
      setDeletingGroupId(null)
    }
  }, [open])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingGroupId) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingGroupId])

  const handleSelectGroup = async (groupId: string | null) => {
    try {
      await updateTrip.mutateAsync({ id: tripId, data: { tripGroupId: groupId } })
      toast({
        title: groupId ? 'Moved to Group' : 'Removed from Group',
        description: groupId ? 'Trip has been moved to the selected group.' : 'Trip has been removed from its group.',
      })
      onOpenChange(false)
    } catch {
      toast({ title: 'Error', description: 'Failed to move trip.', variant: 'destructive' })
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      const group = await createGroup.mutateAsync({ name: newGroupName.trim() })
      await handleSelectGroup(group.id)
      setNewGroupName('')
      setShowCreateForm(false)
    } catch {
      toast({ title: 'Error', description: 'Failed to create group.', variant: 'destructive' })
    }
  }

  const handleStartRename = (groupId: string, currentName: string) => {
    setRenamingGroupId(groupId)
    setRenameValue(currentName)
  }

  const handleRename = async () => {
    if (!renamingGroupId || !renameValue.trim()) return
    try {
      await updateGroup.mutateAsync({ groupId: renamingGroupId, data: { name: renameValue.trim() } })
      toast({ title: 'Group Renamed', description: 'Group name has been updated.' })
      setRenamingGroupId(null)
    } catch (error: any) {
      const message = error?.response?.status === 409
        ? 'A group with this name already exists.'
        : 'Failed to rename group.'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  const handleCancelRename = () => {
    setRenamingGroupId(null)
    setRenameValue('')
  }

  const handleDelete = async (groupId: string) => {
    try {
      await deleteGroup.mutateAsync(groupId)
      toast({ title: 'Group Deleted', description: 'Group has been deleted and trips unlinked.' })
      setDeletingGroupId(null)
    } catch {
      toast({ title: 'Error', description: 'Failed to delete group.', variant: 'destructive' })
    }
  }

  // Expanded group view
  if (expandedGroupId) {
    const expandedGroup = groups.find((g) => g.id === expandedGroupId)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpandedGroupId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle>{expandedGroup?.name || 'Group'}</DialogTitle>
            </div>
            <DialogDescription>Trips in this group</DialogDescription>
          </DialogHeader>
          <ExpandedGroupTrips
            groupId={expandedGroupId}
            currentTripId={tripId}
            onRemoveTrip={async (removeTripId) => {
              try {
                await updateTrip.mutateAsync({ id: removeTripId, data: { tripGroupId: null } })
                toast({ title: 'Removed', description: 'Trip has been removed from the group.' })
              } catch {
                toast({ title: 'Error', description: 'Failed to remove trip.', variant: 'destructive' })
              }
            }}
          />
        </DialogContent>
      </Dialog>
    )
  }

  // Default group list view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Group</DialogTitle>
          <DialogDescription>Select a group or create a new one.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {currentGroupId && (
            <button
              onClick={() => handleSelectGroup(null)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm text-muted-foreground"
            >
              Remove from group
            </button>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground px-3 py-2">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-2">No groups yet. Create one below.</p>
          ) : (
            groups.map((group) => {
              // Delete confirmation
              if (deletingGroupId === group.id) {
                return (
                  <div key={group.id} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-md">
                    <span className="text-sm text-red-700 flex-1">
                      Delete? This will unlink {group.tripCount ?? 0} trip{(group.tripCount ?? 0) !== 1 ? 's' : ''}.
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleDelete(group.id)}
                      disabled={deleteGroup.isPending}
                    >
                      {deleteGroup.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setDeletingGroupId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )
              }

              // Inline rename
              if (renamingGroupId === group.id) {
                return (
                  <div key={group.id} className="flex items-center gap-2 px-3 py-1.5">
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename()
                        if (e.key === 'Escape') handleCancelRename()
                      }}
                      className="h-8 text-sm"
                      disabled={updateGroup.isPending}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleRename}
                      disabled={updateGroup.isPending || !renameValue.trim()}
                    >
                      {updateGroup.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleCancelRename}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )
              }

              // Normal group row
              return (
                <div
                  key={group.id}
                  className="group/row flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted"
                >
                  <button
                    onClick={() => handleSelectGroup(currentGroupId === group.id ? null : group.id)}
                    className="flex-1 text-left text-sm flex items-center gap-2 min-w-0"
                  >
                    <span className="truncate">{group.name}</span>
                    {currentGroupId === group.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>

                  {typeof group.tripCount === 'number' && (
                    <Badge variant="secondary" className="text-xs tabular-nums shrink-0">
                      {group.tripCount}
                    </Badge>
                  )}

                  {/* Hover actions */}
                  <div className="hidden group-hover/row:flex items-center shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(group.id, group.name)
                      }}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedGroupId(group.id)
                      }}
                      title="View trips"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingGroupId(group.id)
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {showCreateForm ? (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="group-name">Group Name</Label>
            <div className="flex gap-2">
              <Input
                id="group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Summer 2025"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              />
              <Button
                size="sm"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || createGroup.isPending}
              >
                {createGroup.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Group
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Expanded view showing trips in a group
 */
function ExpandedGroupTrips({
  groupId,
  currentTripId,
  onRemoveTrip,
}: {
  groupId: string
  currentTripId: string
  onRemoveTrip: (tripId: string) => Promise<void>
}) {
  const { data: trips = [], isLoading } = useTripsByGroup(groupId)
  const [removingId, setRemovingId] = useState<string | null>(null)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground px-3 py-4">Loading trips...</p>
  }

  if (trips.length === 0) {
    return <p className="text-sm text-muted-foreground px-3 py-4">No trips in this group.</p>
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {trips.map((trip) => (
        <div key={trip.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted">
          <div className="flex-1 min-w-0">
            <span className="text-sm truncate block">{trip.name}</span>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {trip.status}
          </Badge>
          {trip.id !== currentTripId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
              disabled={removingId === trip.id}
              onClick={async () => {
                setRemovingId(trip.id)
                await onRemoveTrip(trip.id)
                setRemovingId(null)
              }}
            >
              {removingId === trip.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
