'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import DOMPurify from 'dompurify'
import { Download, FileText, Loader2, Reply, ReplyAll, Forward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useEmailDetail } from '@/hooks/use-emails'
import { ContactMatchBanner } from './contact-match-banner'
import type { EmailAddressDto, EmailAttachmentDto } from '@tailfire/shared-types/api'

interface EmailReaderProps {
  accountId: string
  emailId: string
}

function formatAddresses(addresses: EmailAddressDto[]): string {
  return addresses.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmailReader({ accountId, emailId }: EmailReaderProps) {
  const { data: email, isLoading } = useEmailDetail(accountId, emailId)

  const sanitizedHtml = useMemo(() => {
    if (!email?.bodyHtml) return null
    return DOMPurify.sanitize(email.bodyHtml, {
      ALLOWED_TAGS: [
        'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote',
        'pre', 'code', 'hr', 'dl', 'dt', 'dd', 'sup', 'sub', 'font',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
        'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor',
        'color', 'size', 'face', 'target', 'rel',
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target'],
    })
  }, [email?.bodyHtml])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Select an email to read
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-tight">
            {email.subject || '(no subject)'}
          </h2>
          <div className="flex flex-shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply" disabled>
              <Reply className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply All" disabled>
              <ReplyAll className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Forward" disabled>
              <Forward className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-muted-foreground">From:</span>
            <span>
              {email.fromName && <span className="font-medium">{email.fromName} </span>}
              <span className="text-muted-foreground">
                {email.fromAddress ? `<${email.fromAddress}>` : 'Unknown'}
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-muted-foreground">To:</span>
            <span className="text-muted-foreground">{formatAddresses(email.toAddresses)}</span>
          </div>
          {email.ccAddresses.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-muted-foreground">Cc:</span>
              <span className="text-muted-foreground">{formatAddresses(email.ccAddresses)}</span>
            </div>
          )}
          {email.date && (
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-muted-foreground">Date:</span>
              <span className="text-muted-foreground">
                {format(new Date(email.date), 'PPpp')}
              </span>
            </div>
          )}
        </div>

        {/* Contact match */}
        <ContactMatchBanner matchedContactIds={email.matchedContactIds} contacts={[]} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {sanitizedHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : email.bodyText ? (
          <pre className="whitespace-pre-wrap text-sm">{email.bodyText}</pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Email body not yet loaded. Loading...
          </p>
        )}
      </div>

      {/* Attachments */}
      {email.attachments.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">
              Attachments ({email.attachments.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {email.attachments
                .filter((a: EmailAttachmentDto) => !a.isInline)
                .map((attachment: EmailAttachmentDto) => (
                  <a
                    key={attachment.id}
                    href={
                      attachment.storageUrl ||
                      `/api/v1/email-accounts/${accountId}/emails/${emailId}/attachments/${attachment.id}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="max-w-[200px] truncate">
                      {attachment.filename || 'Attachment'}
                    </span>
                    {attachment.sizeBytes && (
                      <Badge variant="outline" className="text-xs">
                        {formatFileSize(attachment.sizeBytes)}
                      </Badge>
                    )}
                    <Download className="h-3 w-3 text-muted-foreground" />
                  </a>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
