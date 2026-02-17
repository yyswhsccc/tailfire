'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Pin, PinOff, Pencil, Trash2, MoreHorizontal, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/user/user-avatar'
import type { NoteResponseDto } from '@tailfire/shared-types/api'

interface NoteCardProps {
  note: NoteResponseDto
  currentUserId: string | null
  isAdmin: boolean
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
}

export function NoteCard({
  note,
  currentUserId,
  isAdmin,
  onUpdate,
  onDelete,
  onTogglePin,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)

  const canModify = currentUserId === note.createdBy || isAdmin
  const isEdited =
    new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() >
    1000
  const timeAgo = formatDistanceToNow(new Date(note.createdAt), {
    addSuffix: true,
  })

  const authorName = [
    note.createdByUser.firstName,
    note.createdByUser.lastName,
  ]
    .filter(Boolean)
    .join(' ') || 'Unknown'

  function handleSaveEdit() {
    const trimmed = editContent.trim()
    if (trimmed && trimmed !== note.content) {
      onUpdate(note.id, trimmed)
    }
    setIsEditing(false)
  }

  function handleCancelEdit() {
    setEditContent(note.content)
    setIsEditing(false)
  }

  return (
    <div className="group relative rounded-lg border border-ash-200 bg-white p-4">
      {/* Header row: avatar + name + time + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar
            firstName={note.createdByUser.firstName}
            lastName={note.createdByUser.lastName}
            avatarUrl={note.createdByUser.avatarUrl}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-ash-900 truncate">
                {authorName}
              </span>
              <span className="text-xs text-ash-500">{timeAgo}</span>
              {isEdited && (
                <span className="text-xs text-ash-400 italic">
                  (edited)
                </span>
              )}
              {note.isPinned && (
                <Pin className="h-3 w-3 text-orange-500 fill-orange-500 shrink-0" />
              )}
            </div>
          </div>
        </div>

        {/* Actions dropdown */}
        {canModify && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-ash-400 hover:text-ash-600"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onTogglePin(note.id, !note.isPinned)}
              >
                {note.isPinned ? (
                  <>
                    <PinOff className="mr-2 h-4 w-4" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="mr-2 h-4 w-4" />
                    Pin
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setEditContent(note.content)
                  setIsEditing(true)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => onDelete(note.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[60px] text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={handleSaveEdit}>
              <Check className="mr-1 h-3 w-3" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ash-700 whitespace-pre-wrap">
          {note.content}
        </p>
      )}
    </div>
  )
}
