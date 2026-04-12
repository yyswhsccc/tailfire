'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  FolderOpen,
  AlertCircle,
  MoreHorizontal,
  Pencil,
  FolderPlus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useCreateFolder, useRenameFolder, useDeleteFolder } from '@/hooks/use-emails'
import type { EmailFolderDto } from '@tailfire/shared-types/api'
import type { FolderDropData } from '@/lib/dnd-config'

interface FolderSidebarProps {
  accountId: string | null
  folders: EmailFolderDto[]
  activeFolder: string
  onSelectFolder: (path: string) => void
}

const folderIcons: Record<string, React.ReactNode> = {
  '\\Inbox': <Inbox className="h-4 w-4" />,
  '\\Sent': <Send className="h-4 w-4" />,
  '\\Drafts': <FileText className="h-4 w-4" />,
  '\\Trash': <Trash2 className="h-4 w-4" />,
  '\\Junk': <AlertCircle className="h-4 w-4" />,
}

// System folders that cannot be renamed or deleted
const PROTECTED_SPECIAL_USES = ['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Junk']

export function FolderSidebar({ accountId, folders, activeFolder, onSelectFolder }: FolderSidebarProps) {
  const createFolder = useCreateFolder(accountId)
  const renameFolder = useRenameFolder(accountId)
  const deleteFolder = useDeleteFolder(accountId)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [targetFolder, setTargetFolder] = useState<EmailFolderDto | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [createParentPath, setCreateParentPath] = useState<string | null>(null)

  function handleCreate() {
    if (!newFolderName.trim()) return
    const fullPath = createParentPath ? `${createParentPath}/${newFolderName.trim()}` : newFolderName.trim()
    createFolder.mutate(fullPath, {
      onSuccess: () => {
        setShowCreateDialog(false)
        setNewFolderName('')
        setCreateParentPath(null)
      },
    })
  }

  function handleCreateSubFolder(parentFolder: EmailFolderDto) {
    setCreateParentPath(parentFolder.path)
    setNewFolderName('')
    setShowCreateDialog(true)
  }

  function handleRename() {
    if (!targetFolder || !renameTo.trim()) return
    renameFolder.mutate(
      { path: targetFolder.path, newPath: renameTo.trim() },
      {
        onSuccess: () => {
          setShowRenameDialog(false)
          setTargetFolder(null)
          setRenameTo('')
        },
      },
    )
  }

  function handleDelete() {
    if (!targetFolder) return
    deleteFolder.mutate(targetFolder.path, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        setTargetFolder(null)
        // Switch to INBOX if deleted folder was active
        if (activeFolder === targetFolder.path) {
          onSelectFolder('INBOX')
        }
      },
    })
  }

  return (
    <>
      <div className="flex flex-col min-h-0 h-full">
        <nav className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {folders.map((folder) => (
            <DroppableFolderItem
              key={folder.path}
              folder={folder}
              isActive={folder.path === activeFolder}
              onSelectFolder={onSelectFolder}
              onCreateSubFolder={handleCreateSubFolder}
              onRename={(f) => {
                setTargetFolder(f)
                setRenameTo(f.name)
                setShowRenameDialog(true)
              }}
              onDelete={(f) => {
                setTargetFolder(f)
                setShowDeleteConfirm(true)
              }}
            />
          ))}

          {/* New Folder button */}
          <button
            onClick={() => {
              setCreateParentPath(null)
              setNewFolderName('')
              setShowCreateDialog(true)
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </button>
        </nav>
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) setCreateParentPath(null)
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{createParentPath ? 'Create Sub-Folder' : 'Create Folder'}</DialogTitle>
          </DialogHeader>
          {createParentPath && (
            <p className="text-xs text-muted-foreground">
              Inside: {createParentPath}
            </p>
          )}
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={createParentPath ? 'Sub-folder name' : 'Folder name'}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newFolderName.trim() || createFolder.isPending}
            >
              {createFolder.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            placeholder="New folder name"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameTo.trim() || renameFolder.isPending}
            >
              {renameFolder.isPending ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{targetFolder?.name}&rdquo;? All emails in this
            folder will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteFolder.isPending}
            >
              {deleteFolder.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DroppableFolderItem({
  folder,
  isActive,
  onSelectFolder,
  onCreateSubFolder,
  onRename,
  onDelete,
}: {
  folder: EmailFolderDto
  isActive: boolean
  onSelectFolder: (path: string) => void
  onCreateSubFolder: (folder: EmailFolderDto) => void
  onRename: (folder: EmailFolderDto) => void
  onDelete: (folder: EmailFolderDto) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${folder.path}`,
    data: { type: 'folder', folderPath: folder.path } satisfies FolderDropData,
  })

  const icon = folderIcons[folder.specialUse || ''] || <FolderOpen className="h-4 w-4" />
  const isProtected = PROTECTED_SPECIAL_USES.includes(folder.specialUse || '')

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        isOver && 'ring-2 ring-primary bg-accent',
      )}
    >
      <button
        onClick={() => onSelectFolder(folder.path)}
        className="flex flex-1 items-center gap-2 text-left"
      >
        {icon}
        <span className="truncate">{folder.name}</span>
      </button>
      <div className="flex items-center gap-1">
        {folder.unseenMessages > 0 && (
          <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
            {folder.unseenMessages}
          </Badge>
        )}
        {!isProtected && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-44">
              <DropdownMenuItem onClick={() => onCreateSubFolder(folder)}>
                <FolderPlus className="mr-2 h-3.5 w-3.5" />
                Add Sub-Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(folder)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete(folder)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
