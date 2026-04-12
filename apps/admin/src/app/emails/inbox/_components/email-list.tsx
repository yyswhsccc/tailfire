'use client'

import { useRef, useEffect } from 'react'
import { format, isToday, isYesterday, isThisYear } from 'date-fns'
import { useDraggable } from '@dnd-kit/core'
import { Loader2, Mail, MailOpen, Paperclip, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupEmailsByPeriod } from '@/lib/email/group-emails-by-period'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useUpdateEmailFlags, useDeleteEmail } from '@/hooks/use-emails'
import { MoveToFolderDropdown } from './move-to-folder-dropdown'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types/api'
import type { EmailDragData } from '@/lib/dnd-config'

interface EmailListProps {
  accountId: string | null
  activeFolder?: string
  emails: SyncedEmailResponseDto[]
  selectedEmailId: string | null
  onSelectEmail: (emailId: string) => void
  sortBy?: string
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => void
}

function formatEmailDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  if (isThisYear(d)) return format(d, 'MMM d')
  return format(d, 'MMM d, yyyy')
}

function formatEmailDateFull(dateStr: string | null): string {
  if (!dateStr) return ''
  return format(new Date(dateStr), 'MMM d, yyyy h:mm a')
}

export function EmailList({ accountId, activeFolder, emails, selectedEmailId, onSelectEmail, sortBy, hasNextPage, isFetchingNextPage, fetchNextPage }: EmailListProps) {
  const updateFlags = useUpdateEmailFlags(accountId)
  const deleteEmail = useDeleteEmail(accountId)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || !fetchNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const isDateSorted = !sortBy || sortBy === 'date-desc' || sortBy === 'date-asc'
  const items = isDateSorted
    ? groupEmailsByPeriod(emails)
    : emails.map(e => ({ type: 'email' as const, email: e }))

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No emails in this folder.
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="divide-y">
        {items.map((item) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${item.label}`} className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-1.5 text-xs font-medium text-muted-foreground border-b">
                {item.label}
              </div>
            )
          }
          return (
            <DraggableEmailItem
              key={item.email.id}
              email={item.email}
              isSelected={item.email.id === selectedEmailId}
              accountId={accountId}
              activeFolder={activeFolder}
              onSelectEmail={onSelectEmail}
              updateFlags={updateFlags}
              deleteEmail={deleteEmail}
            />
          )
        })}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function DraggableEmailItem({
  email,
  isSelected,
  accountId,
  activeFolder,
  onSelectEmail,
  updateFlags,
  deleteEmail,
}: {
  email: SyncedEmailResponseDto
  isSelected: boolean
  accountId: string | null
  activeFolder?: string
  onSelectEmail: (emailId: string) => void
  updateFlags: ReturnType<typeof useUpdateEmailFlags>
  deleteEmail: ReturnType<typeof useDeleteEmail>
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `email:${email.id}`,
    data: { type: 'email', email } satisfies EmailDragData,
  })

  const displayName = email.isOutbound
    ? email.toAddresses[0]?.name || email.toAddresses[0]?.address || 'Unknown'
    : email.resolvedFromName || email.fromName || email.fromAddress || 'Unknown'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-muted/50',
        isDragging && 'opacity-50',
      )}
      onClick={() => onSelectEmail(email.id)}
    >
      {/* Unread indicator dot */}
      {!email.isSeen && (
        <div className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary" />
      )}

      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'truncate text-sm',
            !email.isSeen && 'font-semibold',
          )}
        >
          {email.isOutbound && <span className="text-muted-foreground">To: </span>}
          {displayName}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Hover action buttons */}
          <div className="flex items-center gap-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateFlags.mutate({
                      emailId: email.id,
                      isSeen: !email.isSeen,
                    })
                  }}
                >
                  {email.isSeen ? (
                    <MailOpen className="h-3.5 w-3.5" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {email.isSeen ? 'Mark unread' : 'Mark read'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateFlags.mutate({
                      emailId: email.id,
                      isFlagged: !email.isFlagged,
                    })
                  }}
                >
                  <Star
                    className={cn(
                      'h-3.5 w-3.5',
                      email.isFlagged && 'fill-yellow-400 text-yellow-400',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {email.isFlagged ? 'Unstar' : 'Star'}
              </TooltipContent>
            </Tooltip>
            <MoveToFolderDropdown
              accountId={accountId}
              emailId={email.id}
              currentFolder={activeFolder}
              size="sm"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteEmail.mutate(email.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete</TooltipContent>
            </Tooltip>
          </div>

          {/* Date (hidden on hover to make room for actions) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground group-hover:hidden">
                {formatEmailDate(email.date)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              {formatEmailDateFull(email.date)}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'truncate text-sm',
            !email.isSeen ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {email.subject || '(no subject)'}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {email.hasAttachments && (
            <Paperclip className="h-3 w-3 text-muted-foreground" />
          )}
          {email.isFlagged && (
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 group-hover:hidden" />
          )}
        </div>
      </div>

      {email.snippet && (
        <p className={cn(
          'truncate text-xs',
          !email.isSeen ? 'text-foreground/70' : 'text-muted-foreground',
        )}>{email.snippet}</p>
      )}
    </div>
  )
}
