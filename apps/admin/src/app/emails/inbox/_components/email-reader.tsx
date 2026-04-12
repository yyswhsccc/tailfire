'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Download,
  FileText,
  Forward,
  Loader2,
  Mail,
  MailOpen,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'
import { useEmailDetail, useUpdateEmailFlags, useDeleteEmail } from '@/hooks/use-emails'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import { useEmailStore } from '@/stores/email.store'
import { ContactMatchBanner } from './contact-match-banner'
import { MoveToFolderDropdown } from './move-to-folder-dropdown'
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
  const updateFlags = useUpdateEmailFlags(accountId)
  const deleteEmail = useDeleteEmail(accountId)
  const openCompose = useEmailStore((s) => s.openCompose)
  const setSelectedEmailId = useEmailStore((s) => s.setSelectedEmailId)
  const [forceShowImages, setForceShowImages] = useState(false)
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()

  // Reset forceShowImages when email changes
  useEffect(() => setForceShowImages(false), [emailId])

  // Auto-mark as read when email is opened
  useEffect(() => {
    if (email && !email.isSeen) {
      updateFlags.mutate({ emailId: email.id, isSeen: true })
    }
  }, [email?.id, email?.isSeen]) // eslint-disable-line react-hooks/exhaustive-deps

  const trustedDomains = (profile?.platformPreferences as any)?.trustedImageDomains ?? []
  const senderDomain = email?.fromAddress?.split('@')[1]?.toLowerCase()

  const { html: sanitizedBody, hasBlockedImages } = useMemo(() => {
    if (!email?.bodyHtml) return { html: '', hasBlockedImages: false }
    return sanitizeEmailHtml(email.bodyHtml, {
      trustedDomains,
      allowAllImages: forceShowImages,
    })
  }, [email?.bodyHtml, trustedDomains, forceShowImages]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTrustDomain(domain: string) {
    const current = (profile?.platformPreferences as any)?.trustedImageDomains ?? []
    if (!current.includes(domain)) {
      updateProfile.mutate({
        platformPreferences: {
          ...(profile?.platformPreferences as object),
          trustedImageDomains: [...current, domain],
        },
      })
    }
    setForceShowImages(true)
  }

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

  function handleReply() {
    if (!email) return
    const replyTo = email.fromAddress
      ? [{ address: email.fromAddress, name: email.fromName || undefined }]
      : []
    openCompose({
      mode: 'reply',
      replyToEmailId: email.id,
      prefillTo: replyTo,
      prefillSubject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      prefillBody: `\n\n---\nOn ${email.date ? format(new Date(email.date), 'PPpp') : ''}, ${email.fromName || email.fromAddress || 'Unknown'} wrote:\n> ${(email.bodyText || '').replace(/\n/g, '\n> ')}`,
    })
  }

  function handleReplyAll() {
    if (!email) return
    const replyTo = email.fromAddress
      ? [{ address: email.fromAddress, name: email.fromName || undefined }]
      : []
    // Include all original To/CC except our own account
    const otherTo = email.toAddresses.filter((a: EmailAddressDto) => a.address !== email.fromAddress)
    const allCc = [...(email.ccAddresses || [])]
    openCompose({
      mode: 'replyAll',
      replyToEmailId: email.id,
      prefillTo: replyTo,
      prefillCc: [...otherTo, ...allCc],
      prefillSubject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      prefillBody: `\n\n---\nOn ${email.date ? format(new Date(email.date), 'PPpp') : ''}, ${email.fromName || email.fromAddress || 'Unknown'} wrote:\n> ${(email.bodyText || '').replace(/\n/g, '\n> ')}`,
    })
  }

  function handleForward() {
    if (!email) return
    openCompose({
      mode: 'forward',
      prefillSubject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
      prefillBody: `\n\n---\nForwarded message from ${email.fromName || email.fromAddress || 'Unknown'}:\n\n${email.bodyText || ''}`,
    })
  }

  function handleToggleRead() {
    updateFlags.mutate({ emailId: email!.id, isSeen: !email!.isSeen })
  }

  function handleToggleStar() {
    updateFlags.mutate({ emailId: email!.id, isFlagged: !email!.isFlagged })
  }

  function handleDelete() {
    deleteEmail.mutate(email!.id, {
      onSuccess: () => setSelectedEmailId(null),
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-tight">
            {email.subject || '(no subject)'}
          </h2>
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-shrink-0 gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReply}>
                    <Reply className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReplyAll}>
                    <ReplyAll className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reply All</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleForward}>
                    <Forward className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Forward</TooltipContent>
              </Tooltip>

              <div className="mx-1 h-8 w-px bg-border" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleRead}>
                    {email.isSeen ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MailOpen className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{email.isSeen ? 'Mark as unread' : 'Mark as read'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleStar}>
                    <Star className={`h-4 w-4 ${email.isFlagged ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{email.isFlagged ? 'Unstar' : 'Star'}</TooltipContent>
              </Tooltip>
              <MoveToFolderDropdown
                accountId={accountId}
                emailId={emailId}
                currentFolder={email.folder}
                size="default"
                onMoved={() => setSelectedEmailId(null)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={handleDelete}
                    disabled={deleteEmail.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
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
        <ContactMatchBanner
          matchedContactIds={email.matchedContactIds}
          contacts={[]}
          fromAddress={email.fromAddress}
          fromName={email.fromName}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {hasBlockedImages && !forceShowImages && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 mb-3">
            <span className="flex-1">Images from this sender are hidden for privacy.</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-amber-700 underline" onClick={() => setForceShowImages(true)}>
              Load images
            </Button>
            {senderDomain && (
              <Button variant="link" size="sm" className="h-auto p-0 text-amber-700 underline" onClick={() => handleTrustDomain(senderDomain)}>
                Always load from @{senderDomain}
              </Button>
            )}
          </div>
        )}
        {sanitizedBody && email.bodyHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizedBody }}
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
