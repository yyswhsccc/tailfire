'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Mail,
  Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmails, useEmailLogs } from '@/hooks/use-emails'
import type { SyncedEmailResponseDto, EmailLogResponse } from '@tailfire/shared-types/api'
import { EmailPreviewDialog } from './email-preview-dialog'

interface RecentEmailsCardProps {
  contactId: string
  onViewAll: () => void
}

type SidebarEmail = {
  id: string
  rawId: string
  source: 'agent' | 'system'
  subject: string
  fromName: string | null
  fromAddress: string
  date: string
  direction: 'inbound' | 'outbound'
  isSeen: boolean
  hasAttachments: boolean
  folder?: string
}

function mapAgent(e: SyncedEmailResponseDto): SidebarEmail {
  return {
    id: `agent-${e.id}`,
    rawId: e.id,
    source: 'agent',
    subject: e.subject || '(no subject)',
    fromName: e.fromName,
    fromAddress: e.fromAddress || '',
    date: e.date || e.syncedAt,
    direction: e.isOutbound ? 'outbound' : 'inbound',
    isSeen: e.isSeen,
    hasAttachments: e.hasAttachments,
    folder: e.folder,
  }
}

function mapSystem(log: EmailLogResponse): SidebarEmail {
  return {
    id: `system-${log.id}`,
    rawId: log.id,
    source: 'system',
    subject: log.subject || '(no subject)',
    fromName: null,
    fromAddress: log.fromEmail,
    date: log.sentAt || log.createdAt,
    direction: 'outbound',
    isSeen: true,
    hasAttachments: false,
  }
}

export function RecentEmailsCard({ contactId, onViewAll }: RecentEmailsCardProps) {
  const { data: accounts } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  const { data: agentData, isLoading: agentLoading } = useEmails(accountId, {
    contactId,
    limit: 5,
  })
  const { data: systemData, isLoading: systemLoading } = useEmailLogs(contactId)

  const [previewEmail, setPreviewEmail] = useState<SidebarEmail | null>(null)

  const isLoading = systemLoading || (accountId ? agentLoading : false)

  const emails = useMemo(() => {
    const agentEmails = (agentData?.emails || []).map(mapAgent)
    const rawAgentMessageIds = new Set(
      (agentData?.emails || []).map((e) => e.messageId).filter(Boolean),
    )
    const systemEmails = (systemData?.data || [])
      .filter((log) => !log.providerMessageId || !rawAgentMessageIds.has(log.providerMessageId))
      .map(mapSystem)

    return [...agentEmails, ...systemEmails]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
  }, [agentData, systemData])

  const totalCount = (agentData?.emails?.length || 0) + (systemData?.data?.length || 0)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold text-ash-900 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Recent Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-phoenix-gold-600" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-2">
              <div className="rounded-full bg-ash-100 p-3 mb-2">
                <Mail className="h-5 w-5 text-ash-400" />
              </div>
              <p className="text-xs text-ash-600 text-center">
                No emails yet
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewEmail(email)}
                    onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setPreviewEmail(email)
                      }
                    }}
                    className={cn(
                      'flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-ash-50',
                      !email.isSeen && 'font-semibold',
                    )}
                  >
                    {/* Direction icon */}
                    <div className="pt-0.5 flex-shrink-0">
                      {email.direction === 'inbound' ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-ash-900 truncate">
                          {email.fromName || email.fromAddress}
                        </p>
                        {email.source === 'agent' ? (
                          <Badge variant="booked" className="text-[9px] px-1 py-0 h-3.5">
                            Agent
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                            System
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-ash-700 truncate">{email.subject}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-ash-500">
                          {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                        </span>
                        {email.hasAttachments && (
                          <Paperclip className="h-2.5 w-2.5 text-ash-400" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalCount > 3 && (
                <div className="pt-1 border-t border-ash-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onViewAll}
                    className="w-full justify-center text-xs h-8 text-ash-600 hover:text-phoenix-gold-600"
                  >
                    View all emails
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {previewEmail && (
        <EmailPreviewDialog
          open={!!previewEmail}
          onOpenChange={(open) => { if (!open) setPreviewEmail(null) }}
          source={previewEmail.source}
          rawId={previewEmail.rawId}
          accountId={accountId}
          folder={previewEmail.folder}
          subject={previewEmail.subject}
        />
      )}
    </>
  )
}
