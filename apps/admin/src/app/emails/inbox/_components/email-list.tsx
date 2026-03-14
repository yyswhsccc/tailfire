'use client'

import { formatDistanceToNow } from 'date-fns'
import { Paperclip, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types/api'

interface EmailListProps {
  emails: SyncedEmailResponseDto[]
  selectedEmailId: string | null
  onSelectEmail: (emailId: string) => void
}

export function EmailList({ emails, selectedEmailId, onSelectEmail }: EmailListProps) {
  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No emails in this folder.
      </div>
    )
  }

  return (
    <div className="divide-y">
      {emails.map((email) => {
        const isSelected = email.id === selectedEmailId
        const displayName = email.isOutbound
          ? email.toAddresses[0]?.name || email.toAddresses[0]?.address || 'Unknown'
          : email.fromName || email.fromAddress || 'Unknown'

        return (
          <button
            key={email.id}
            onClick={() => onSelectEmail(email.id)}
            className={cn(
              'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
              isSelected ? 'bg-accent' : 'hover:bg-muted/50',
              !email.isSeen && 'font-semibold',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">
                {email.isOutbound && <span className="text-muted-foreground">To: </span>}
                {displayName}
              </span>
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {email.date
                  ? formatDistanceToNow(new Date(email.date), { addSuffix: true })
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-foreground">
                {email.subject || '(no subject)'}
              </span>
              <div className="flex flex-shrink-0 items-center gap-1">
                {email.hasAttachments && (
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                )}
                {email.isFlagged && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
              </div>
            </div>
            {email.snippet && (
              <p className="truncate text-xs text-muted-foreground">{email.snippet}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}
