'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Mail,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmails, useSyncEmails, useUnreadEmailCount } from '@/hooks/use-emails'
import { useEmailStore } from '@/stores/email.store'

export function SidebarRecentEmails() {
  const router = useRouter()
  const { data: accounts } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  const { data: emailsData, isLoading } = useEmails(accountId, {
    folder: 'INBOX',
    limit: 5,
  })
  const syncEmails = useSyncEmails(accountId)
  const unreadCount = useUnreadEmailCount()

  const emails = useMemo(() => emailsData?.emails || [], [emailsData])

  function handleClickEmail(emailId: string) {
    useEmailStore.setState({
      activeFolder: 'INBOX',
      selectedEmailId: emailId,
      search: '',
    })
    router.push('/emails/inbox')
  }

  function handleCompose() {
    useEmailStore.setState({ compose: { mode: 'new' } })
    router.push('/emails/inbox')
  }

  // No email account configured — show nothing
  if (!accountId && !isLoading) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          Inbox
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center">
              {unreadCount}
            </Badge>
          )}
        </h4>
      </div>

      {/* Quick tools */}
      <div className="flex gap-1 mb-3">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={handleCompose}
        >
          <Pencil className="h-3 w-3 mr-1" />
          Compose
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={() => router.push('/emails/inbox')}
        >
          <Inbox className="h-3 w-3 mr-1" />
          Inbox
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => syncEmails.mutate()}
          disabled={syncEmails.isPending}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncEmails.isPending && 'animate-spin')} />
        </Button>
      </div>

      {/* Recent emails */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading...
        </div>
      ) : emails.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Mail className="h-4 w-4" />
          No recent emails
        </div>
      ) : (
        <div className="space-y-1">
          {emails.slice(0, 5).map((email) => (
            <button
              key={email.id}
              onClick={() => handleClickEmail(email.id)}
              className={cn(
                'w-full text-left rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50',
                !email.isSeen && 'font-semibold',
              )}
            >
              <div className="flex items-center gap-1.5">
                {email.isOutbound ? (
                  <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-blue-600" />
                ) : (
                  <ArrowDownLeft className="h-3 w-3 flex-shrink-0 text-green-600" />
                )}
                <span className="text-xs truncate flex-1">
                  {email.fromName || email.fromAddress || 'Unknown'}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(email.date || email.syncedAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate pl-[18px]">
                {email.subject || '(no subject)'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
