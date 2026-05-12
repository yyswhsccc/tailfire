'use client'

import { useState } from 'react'
import { Tag, Plus, Loader2, AlertCircle, Search, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/use-tags'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { useUser } from '@/hooks/use-user'
import { confirmDialog } from '@/components/ui/confirmation-dialog'
import { useToast } from '@/hooks/use-toast'
import type { TagWithUsageDto } from '@tailfire/shared-types/api'

/**
 * Tags Library Page
 *
 * Two-tab layout for managing system tags (agency-wide) and agent tags (personal).
 * Admins can CRUD system tags. All users can CRUD their own agent tags.
 */
export default function TagsLibraryPage() {
  // Effective isAdmin so impersonated agents see the agent-tag-only view.
  const { isAdmin } = useUser()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'system' | 'agent'>('system')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Tag form dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagWithUsageDto | null>(null)
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState('#8B5CF6')
  const [formCategory, setFormCategory] = useState('')

  // Debounce search
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSetSearch(value)
  }

  // Fetch tags by type
  const { data: tags = [], isLoading, error } = useTags({
    type: activeTab,
    search: debouncedSearch || undefined,
    sortBy: 'name',
    sortOrder: 'asc',
  })

  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const canEditSystemTags = isAdmin
  const canEdit = activeTab === 'system' ? canEditSystemTags : true

  const handleNewTag = () => {
    setEditingTag(null)
    setFormName('')
    setFormColor('#8B5CF6')
    setFormCategory('')
    setIsDialogOpen(true)
  }

  const handleEditTag = (tag: TagWithUsageDto) => {
    setEditingTag(tag)
    setFormName(tag.name)
    setFormColor(tag.color || '#8B5CF6')
    setFormCategory(tag.category || '')
    setIsDialogOpen(true)
  }

  const handleDeleteTag = async (tag: TagWithUsageDto) => {
    const confirmed = await confirmDialog({
      title: 'Delete tag',
      description: `Delete "${tag.name}"? It will be removed from ${tag.usageCount} entities. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })

    if (confirmed) {
      try {
        await deleteTag.mutateAsync(tag.id)
        toast({ title: 'Tag deleted', description: `"${tag.name}" has been deleted.` })
      } catch {
        toast({ title: 'Failed to delete tag', variant: 'destructive' })
      }
    }
  }

  const handleSaveTag = async () => {
    if (!formName.trim()) return

    try {
      if (editingTag) {
        await updateTag.mutateAsync({
          id: editingTag.id,
          data: {
            name: formName.trim(),
            color: formColor || null,
            category: formCategory.trim() || null,
          },
        })
        toast({ title: 'Tag updated' })
      } else {
        await createTag.mutateAsync({
          name: formName.trim(),
          color: formColor || null,
          category: formCategory.trim() || null,
          type: activeTab,
        })
        toast({ title: 'Tag created' })
      }
      setIsDialogOpen(false)
    } catch {
      toast({ title: 'Failed to save tag', variant: 'destructive' })
    }
  }

  const PRESET_COLORS = [
    '#8B5CF6', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B',
    '#EF4444', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
            <Tag className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
            <p className="text-sm text-muted-foreground">
              Organize contacts, trips, and other entities with tags
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'system' | 'agent'); setSearchQuery(''); setDebouncedSearch('') }}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="system">System Tags</TabsTrigger>
            <TabsTrigger value="agent">My Tags</TabsTrigger>
          </TabsList>

          {canEdit && (
            <Button onClick={handleNewTag} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Tag
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 max-w-sm"
          />
        </div>

        <TabsContent value="system" className="mt-4">
          <TagTable
            tags={tags}
            isLoading={isLoading}
            error={error}
            canEdit={canEditSystemTags}
            onEdit={handleEditTag}
            onDelete={handleDeleteTag}
            emptyMessage="No system tags yet. Admins can create tags visible to all agents."
          />
        </TabsContent>

        <TabsContent value="agent" className="mt-4">
          <TagTable
            tags={tags}
            isLoading={isLoading}
            error={error}
            canEdit={true}
            onEdit={handleEditTag}
            onDelete={handleDeleteTag}
            emptyMessage="No personal tags yet. Create tags only you can see."
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., VIP, Family, Honeymoon"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tag-category">Category (optional)</Label>
              <Input
                id="tag-category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g., trip-type, client-status"
              />
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-7 h-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: color,
                        borderColor: formColor === color ? '#1f2937' : 'transparent',
                        transform: formColor === color ? 'scale(1.15)' : 'scale(1)',
                      }}
                      onClick={() => setFormColor(color)}
                    />
                  ))}
                </div>
                <Input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-10 h-8 p-0.5 cursor-pointer"
                />
              </div>
            </div>
            {/* Preview */}
            {formName && (
              <div className="flex items-center gap-2 pt-2">
                <span className="text-sm text-muted-foreground">Preview:</span>
                <Badge
                  className="rounded-md px-2 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: formColor,
                    color: getContrastColor(formColor),
                    border: 'none',
                  }}
                >
                  {formName}
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTag}
              disabled={!formName.trim() || createTag.isPending || updateTag.isPending}
            >
              {(createTag.isPending || updateTag.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {editingTag ? 'Save Changes' : 'Create Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===========================================================================
// Tag Table Component
// ===========================================================================

function TagTable({
  tags,
  isLoading,
  error,
  canEdit,
  onEdit,
  onDelete,
  emptyMessage,
}: {
  tags: TagWithUsageDto[]
  isLoading: boolean
  error: Error | null
  canEdit: boolean
  onEdit: (tag: TagWithUsageDto) => void
  onDelete: (tag: TagWithUsageDto) => void
  emptyMessage: string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>Failed to load tags</span>
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Tag className="h-8 w-8 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tag</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Trips</TableHead>
          <TableHead className="text-right">Contacts</TableHead>
          <TableHead className="text-right">Tasks</TableHead>
          <TableHead className="text-right">Events</TableHead>
          <TableHead className="text-right">Total</TableHead>
          {canEdit && <TableHead className="w-[80px]" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tags.map((tag) => (
          <TableRow key={tag.id}>
            <TableCell>
              <Badge
                className="rounded-md px-2 py-1 text-sm font-medium"
                style={{
                  backgroundColor: tag.color || '#e5e7eb',
                  color: tag.color ? getContrastColor(tag.color) : '#1f2937',
                  border: 'none',
                }}
              >
                {tag.name}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {tag.category || '-'}
            </TableCell>
            <TableCell className="text-right tabular-nums">{tag.tripCount}</TableCell>
            <TableCell className="text-right tabular-nums">{tag.contactCount}</TableCell>
            <TableCell className="text-right tabular-nums">{tag.taskCount}</TableCell>
            <TableCell className="text-right tabular-nums">{tag.eventCount}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">{tag.usageCount}</TableCell>
            {canEdit && (
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(tag)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDelete(tag)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}
