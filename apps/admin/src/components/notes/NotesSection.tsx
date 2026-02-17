'use client'

import { useState } from 'react'
import { StickyNote, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/empty-state'
import { NoteCard } from './NoteCard'
import {
  useNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useToggleNotePin,
} from '@/hooks/use-notes'
import { useUser } from '@/hooks/use-user'
import { useMyProfile } from '@/hooks/use-user-profile'
import { useToast } from '@/hooks/use-toast'

interface NotesSectionProps {
  tripId?: string
  contactId?: string
}

export function NotesSection({ tripId, contactId }: NotesSectionProps) {
  const [newContent, setNewContent] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const { userId, isAdmin } = useUser()
  const { data: profile } = useMyProfile()
  const { toast } = useToast()

  const { data, isLoading } = useNotes({
    tripId,
    contactId,
    page,
    limit,
  })

  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const togglePin = useToggleNotePin()

  const notes = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  function handleSubmit() {
    const trimmed = newContent.trim()
    if (!trimmed || !userId) return

    // Clear input immediately for instant feedback
    setNewContent('')
    setPage(1)

    createNote.mutate(
      {
        content: trimmed,
        tripId,
        contactId,
        _optimistic: {
          userId,
          firstName: profile?.firstName ?? undefined,
          lastName: profile?.lastName ?? undefined,
          avatarUrl: profile?.avatarUrl ?? undefined,
        },
      },
      {
        onError: (error) => {
          // Restore content on failure so user doesn't lose their text
          setNewContent(trimmed)
          toast({
            title: 'Failed to create note',
            description: error.message,
            variant: 'destructive',
          })
        },
      }
    )
  }

  function handleUpdate(id: string, content: string) {
    updateNote.mutate(
      { id, data: { content } },
      {
        onError: (error) => {
          toast({
            title: 'Failed to update note',
            description: error.message,
            variant: 'destructive',
          })
        },
      }
    )
  }

  function handleDelete(id: string) {
    deleteNote.mutate(id, {
      onError: (error) => {
        toast({
          title: 'Failed to delete note',
          description: error.message,
          variant: 'destructive',
        })
      },
    })
  }

  function handleTogglePin(id: string, isPinned: boolean) {
    togglePin.mutate(
      { id, isPinned },
      {
        onError: (error) => {
          toast({
            title: 'Failed to update pin',
            description: error.message,
            variant: 'destructive',
          })
        },
      }
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="space-y-4 p-6">
      {/* Create form */}
      <div className="space-y-2">
        <Textarea
          placeholder="Write a note..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ash-400">
            Press {navigator?.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to submit
          </span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newContent.trim() || createNote.isPending}
          >
            {createNote.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add Note
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ash-400" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-10 w-10 text-ash-300" />}
          title="No notes yet"
          description="Add a note above to get started."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentUserId={userId}
              isAdmin={isAdmin}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
            />
          ))}

          {/* Load more pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-ash-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
