'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Mail,
  Paperclip,
  Search,
  Star,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmails, useEmailLogs } from '@/hooks/use-emails'
import type { SyncedEmailResponseDto, EmailLogResponse } from '@tailfire/shared-types/api'

// =============================================================================
// Types
// =============================================================================

type UnifiedEmail = {
  id: string
  source: 'agent' | 'system'
  direction: 'inbound' | 'outbound'
  subject: string
  snippet: string | null
  date: string
  fromName: string | null
  fromAddress: string
  isSeen: boolean
  hasAttachments: boolean
  isFlagged: boolean
  status: string | null
  category: string | null
  templateSlug: string | null
}

type TypeFilter = 'all' | 'agent' | 'system'

// =============================================================================
// Helpers
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  trip_order: 'Trip Order',
  notification: 'Notification',
  marketing: 'Marketing',
  system: 'System',
  payment: 'Payment',
  client_care: 'Client Care',
}

function mapAgentEmail(email: SyncedEmailResponseDto): UnifiedEmail {
  return {
    id: `agent-${email.id}`,
    source: 'agent',
    direction: email.isOutbound ? 'outbound' : 'inbound',
    subject: email.subject || '(no subject)',
    snippet: email.snippet,
    date: email.date || email.syncedAt,
    fromName: email.fromName,
    fromAddress: email.fromAddress || '',
    isSeen: email.isSeen,
    hasAttachments: email.hasAttachments,
    isFlagged: email.isFlagged,
    status: null,
    category: null,
    templateSlug: null,
  }
}

function mapSystemEmail(log: EmailLogResponse): UnifiedEmail {
  return {
    id: `system-${log.id}`,
    source: 'system',
    direction: 'outbound',
    subject: log.subject || '(no subject)',
    snippet: null,
    date: log.sentAt || log.createdAt,
    fromName: null,
    fromAddress: log.fromEmail,
    isSeen: true,
    hasAttachments: false,
    isFlagged: false,
    status: log.status,
    category: log.category,
    templateSlug: log.templateSlug,
  }
}

function getStatusBadge(status: string | null) {
  if (!status) return null
  switch (status) {
    case 'sent':
      return <Badge variant="completed" className="text-[10px]">Delivered</Badge>
    case 'failed':
      return <Badge variant="destructive" className="text-[10px]">Failed</Badge>
    case 'pending':
      return <Badge variant="planning" className="text-[10px]">Pending</Badge>
    case 'filtered':
      return <Badge variant="secondary" className="text-[10px]">Filtered</Badge>
    default:
      return null
  }
}

// =============================================================================
// Component
// =============================================================================

interface ContactEmailsSectionProps {
  contactId: string
}

export function ContactEmailsSection({ contactId }: ContactEmailsSectionProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounce search with cleanup
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }, [])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  // Agent emails (optional — depends on IMAP account)
  const { data: accounts, isLoading: accountsLoading } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  const { data: agentData, isLoading: agentLoading } = useEmails(accountId, {
    contactId,
    limit: 100,
  })

  // System emails (always available) — pass search for server-side filtering
  const { data: systemData, isLoading: systemLoading } = useEmailLogs(contactId, {
    search: debouncedSearch || undefined,
  })

  const isLoading = accountsLoading || systemLoading || (accountId ? agentLoading : false)

  // Merge and filter
  const emails = useMemo(() => {
    const rawAgentEmails = agentData?.emails || []
    const agentEmails = rawAgentEmails.map(mapAgentEmail)
    const systemEmails = (systemData?.data || []).map(mapSystemEmail)

    let merged: UnifiedEmail[] = []
    if (typeFilter === 'agent') {
      merged = agentEmails
    } else if (typeFilter === 'system') {
      merged = systemEmails
    } else {
      // Deduplicate: if a system email's providerMessageId matches an agent email's messageId,
      // keep only the agent version (richer data: snippet, read status, etc.)
      const agentMessageIds = new Set(
        rawAgentEmails.map((e) => e.messageId).filter(Boolean),
      )
      const dedupedSystemEmails = (systemData?.data || [])
        .filter((log) => !log.providerMessageId || !agentMessageIds.has(log.providerMessageId))
        .map(mapSystemEmail)
      merged = [...agentEmails, ...dedupedSystemEmails]
    }

    // Client-side search by subject
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      merged = merged.filter((e) => e.subject.toLowerCase().includes(q))
    }

    // Sort by date descending
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return merged
  }, [agentData, systemData, typeFilter, debouncedSearch])

  // When searching, show filtered vs total; otherwise just show total
  const totalCount = emails.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
        {accountId && (
          <Link
            href="/emails/inbox"
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline"
          >
            Open Inbox <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {`${totalCount} email${totalCount !== 1 ? 's' : ''}`}
      </p>

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Mail className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No emails found</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {emails.map((email) => (
            <div
              key={email.id}
              className={cn(
                'flex flex-col gap-1.5 px-4 py-3',
                !email.isSeen && 'font-semibold',
              )}
            >
              {/* Row 1: Direction + sender + badge + date */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Direction arrow */}
                  {email.direction === 'inbound' ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />
                  )}

                  {/* Unread dot (agent only) */}
                  {!email.isSeen && email.source === 'agent' && (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
                  )}

                  {/* Sender name */}
                  <span className="truncate text-sm">
                    {email.fromName || email.fromAddress}
                  </span>

                  {/* Source / category badge */}
                  {email.source === 'agent' ? (
                    <Badge variant="booked" className="flex-shrink-0 text-[10px]">
                      Agent
                    </Badge>
                  ) : email.category ? (
                    <Badge variant="secondary" className="flex-shrink-0 text-[10px]">
                      {CATEGORY_LABELS[email.category] || email.category}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex-shrink-0 text-[10px]">
                      System
                    </Badge>
                  )}
                </div>

                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                </span>
              </div>

              {/* Row 2: Subject + icons + status */}
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-foreground">
                  {email.subject}
                </span>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {email.hasAttachments && (
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                  )}
                  {email.isFlagged && (
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  )}
                  {email.source === 'system' && getStatusBadge(email.status)}
                </div>
              </div>

              {/* Row 3: Snippet (agent emails only) */}
              {email.snippet && (
                <p className="truncate text-xs text-muted-foreground">{email.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
