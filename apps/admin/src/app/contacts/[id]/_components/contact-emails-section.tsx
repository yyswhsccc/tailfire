'use client'

import { formatDistanceToNow } from 'date-fns'
import { Loader2, Mail, Paperclip, Star, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmails } from '@/hooks/use-emails'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types/api'

interface ContactEmailsSectionProps {
  contactId: string
}

export function ContactEmailsSection({ contactId }: ContactEmailsSectionProps) {
  const { data: accounts, isLoading: accountsLoading } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  const { data: emailsData, isLoading: emailsLoading } = useEmails(accountId, {
    contactId,
  })

  if (accountsLoading || emailsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Mail className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No email account configured.{' '}
          <Link href="/profile?tab=email" className="text-primary hover:underline">
            Set up email
          </Link>{' '}
          to see communication history.
        </p>
      </div>
    )
  }

  const emails = emailsData?.emails || []

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Mail className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No emails found for this contact.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {emailsData?.total ?? emails.length} email{emails.length !== 1 ? 's' : ''}
        </h3>
        <Link
          href="/emails/inbox"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open Inbox <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y rounded-lg border">
        {emails.map((email: SyncedEmailResponseDto) => {
          const displayName = email.isOutbound
            ? email.toAddresses[0]?.name || email.toAddresses[0]?.address || 'Unknown'
            : email.fromName || email.fromAddress || 'Unknown'

          return (
            <div
              key={email.id}
              className={cn(
                'flex flex-col gap-1 px-4 py-3',
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
