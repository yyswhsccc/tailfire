'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'
import { useEmailDetail, useEmailLogDetail } from '@/hooks/use-emails'
import { useEmailStore } from '@/stores/email.store'

interface EmailPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: 'agent' | 'system'
  rawId: string
  accountId: string | null
  folder?: string
  subject: string
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  source,
  rawId,
  accountId,
  folder,
  subject,
}: EmailPreviewDialogProps) {
  const router = useRouter()

  const { data: agentEmail, isLoading: agentLoading } = useEmailDetail(
    source === 'agent' ? accountId : null,
    source === 'agent' ? rawId : null,
  )

  const { data: systemEmail, isLoading: systemLoading } = useEmailLogDetail(
    source === 'system' ? rawId : null,
  )

  const isLoading = source === 'agent' ? agentLoading : systemLoading

  const bodyHtml = source === 'agent' ? agentEmail?.bodyHtml : systemEmail?.bodyHtml
  const bodyText = source === 'agent' ? agentEmail?.bodyText : systemEmail?.bodyText

  const sanitizedHtml = useMemo(() => {
    if (!bodyHtml) return null
    return sanitizeEmailHtml(bodyHtml)
  }, [bodyHtml])

  const fromLine = source === 'agent'
    ? [agentEmail?.fromName, agentEmail?.fromAddress ? `<${agentEmail.fromAddress}>` : null].filter(Boolean).join(' ')
    : systemEmail?.fromEmail || ''

  const toLine = source === 'agent'
    ? agentEmail?.toAddresses?.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
    : systemEmail?.toEmail?.join(', ')

  const dateLine = source === 'agent'
    ? agentEmail?.date
    : systemEmail?.sentAt || systemEmail?.createdAt

  function handleOpenInInbox() {
    useEmailStore.setState({
      activeFolder: folder || 'INBOX',
      selectedEmailId: rawId,
      search: '',
    })
    router.push('/emails/inbox')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight pr-8">
            {subject}
          </DialogTitle>
        </DialogHeader>

        {/* Meta */}
        {!isLoading && (fromLine || toLine || dateLine) && (
          <div className="space-y-1 text-sm border-b pb-3">
            {fromLine && (
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-muted-foreground">From:</span>
                <span className="text-muted-foreground">{fromLine}</span>
              </div>
            )}
            {toLine && (
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-muted-foreground">To:</span>
                <span className="text-muted-foreground">{toLine}</span>
              </div>
            )}
            {dateLine && (
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-muted-foreground">Date:</span>
                <span className="text-muted-foreground">
                  {format(new Date(dateLine), 'PPpp')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sanitizedHtml ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : bodyText ? (
            <pre className="whitespace-pre-wrap text-sm">{bodyText}</pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">No email body available.</p>
          )}
        </div>

        {/* Footer */}
        {source === 'agent' && (
          <div className="flex justify-end border-t pt-3">
            <Button variant="outline" size="sm" onClick={handleOpenInInbox}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in Inbox
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
