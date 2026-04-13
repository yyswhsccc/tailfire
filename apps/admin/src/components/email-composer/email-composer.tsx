'use client'

import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { Loader2, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useSendEmail } from '@/hooks/use-emails'
import { useEmailStore, type ComposeState } from '@/stores/email.store'

import { RecipientTokenInput, type RecipientToken } from './recipient-token-input'
import { ComposerToolbar } from './composer-toolbar'
import { TemplatePicker } from './template-picker'
import { AttachmentBar, type AttachmentFile } from './attachment-bar'
import { SignaturePreview } from './signature-preview'

// ============================================================================
// Types
// ============================================================================

interface EmailComposerProps {
  accountId: string
  compose: ComposeState
  onSent?: () => void
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

const MODE_LABELS: Record<ComposeState['mode'], string> = {
  new: 'New Email',
  reply: 'Reply',
  replyAll: 'Reply All',
  forward: 'Forward',
}

function prefillToTokens(
  prefill?: { address: string; name?: string }[],
): RecipientToken[] {
  if (!prefill) return []
  return prefill.map((p) => ({ address: p.address, name: p.name }))
}

// ============================================================================
// Component
// ============================================================================

export function EmailComposer({
  accountId,
  compose,
  onSent,
  className,
}: EmailComposerProps) {
  const closeCompose = useEmailStore((s) => s.closeCompose)
  const sendEmail = useSendEmail(accountId)

  // ── Recipient state ───────────────────────────────────────────────────────
  const [toTokens, setToTokens] = React.useState<RecipientToken[]>(() =>
    prefillToTokens(compose.prefillTo),
  )
  const [ccTokens, setCcTokens] = React.useState<RecipientToken[]>(() =>
    prefillToTokens(compose.prefillCc),
  )
  const [bccTokens, setBccTokens] = React.useState<RecipientToken[]>([])
  const [showCcBcc, setShowCcBcc] = React.useState(
    () => (compose.prefillCc?.length ?? 0) > 0,
  )

  // ── Subject ───────────────────────────────────────────────────────────────
  const [subject, setSubject] = React.useState(compose.prefillSubject ?? '')

  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments, setAttachments] = React.useState<AttachmentFile[]>([])
  const attachFileInputRef = React.useRef<HTMLInputElement>(null)

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({ placeholder: 'Write your message...' }),
      TextAlign.configure({ types: ['paragraph'] }),
    ],
    content: compose.prefillBody ?? '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  })

  // ── Validation ────────────────────────────────────────────────────────────
  const canSend =
    toTokens.length > 0 && subject.trim().length > 0 && !sendEmail.isPending

  // ── Template insert ───────────────────────────────────────────────────────
  const handleTemplateInsert = React.useCallback(
    (result: { subject: string; bodyHtml: string }) => {
      if (result.subject) {
        setSubject(result.subject)
      }
      if (result.bodyHtml && editor) {
        editor.commands.setContent(result.bodyHtml)
      }
    },
    [editor],
  )

  // ── Attach click (toolbar) ────────────────────────────────────────────────
  const handleAttachClick = React.useCallback(() => {
    attachFileInputRef.current?.click()
  }, [])

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = React.useCallback(async () => {
    if (!canSend || !editor) return

    const toAddresses = toTokens.map((t) => ({
      address: t.address,
      name: t.name,
    }))
    const ccAddresses =
      ccTokens.length > 0
        ? ccTokens.map((t) => ({ address: t.address, name: t.name }))
        : undefined
    const bccAddresses =
      bccTokens.length > 0
        ? bccTokens.map((t) => ({ address: t.address, name: t.name }))
        : undefined

    const mappedAttachments =
      attachments.length > 0
        ? attachments.map((a) => ({
            filename: a.filename,
            storagePath: a.storagePath,
            contentType: a.contentType,
            size: a.size,
          }))
        : undefined

    try {
      await sendEmail.mutateAsync({
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject,
        bodyHtml: editor.getHTML(),
        inReplyToEmailId: compose.replyToEmailId,
        attachments: mappedAttachments,
      })
      closeCompose()
      onSent?.()
    } catch {
      // Error is handled by the mutation's onError toast
    }
  }, [
    canSend,
    editor,
    toTokens,
    ccTokens,
    bccTokens,
    subject,
    attachments,
    compose.replyToEmailId,
    sendEmail,
    closeCompose,
    onSent,
  ])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h3 className="text-sm font-semibold">{MODE_LABELS[compose.mode]}</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!canSend}
            onClick={handleSend}
            className="gap-1.5"
          >
            {sendEmail.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={closeCompose}
            className="h-8 w-8 p-0"
            aria-label="Discard"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* To */}
      <div className="shrink-0">
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <RecipientTokenInput
              label="To"
              tokens={toTokens}
              onChange={setToTokens}
              placeholder="Recipients..."
            />
          </div>
          {!showCcBcc && (
            <button
              type="button"
              className="shrink-0 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowCcBcc(true)}
            >
              Cc / Bcc
            </button>
          )}
        </div>
      </div>

      {/* Cc / Bcc */}
      {showCcBcc && (
        <div className="shrink-0">
          <RecipientTokenInput
            label="Cc"
            tokens={ccTokens}
            onChange={setCcTokens}
            placeholder="Cc recipients..."
          />
          <RecipientTokenInput
            label="Bcc"
            tokens={bccTokens}
            onChange={setBccTokens}
            placeholder="Bcc recipients..."
          />
        </div>
      )}

      {/* Subject */}
      <div className="shrink-0 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground min-w-[28px] shrink-0">
            Subject
          </span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject..."
            className="border-0 shadow-none focus-visible:ring-0 h-8 px-0 text-sm"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0">
        <ComposerToolbar
          editor={editor}
          onAttachClick={handleAttachClick}
        />
      </div>

      {/* Template picker row */}
      <div className="shrink-0 flex items-center gap-2 border-b px-2 py-1">
        <TemplatePicker
          tripId={compose.tripId}
          contactId={compose.contactId}
          onInsert={handleTemplateInsert}
        />
      </div>

      {/* Editor + Signature */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <EditorContent editor={editor} />
        <SignaturePreview />
      </div>

      {/* Attachments */}
      <div className="shrink-0">
        {/* Hidden file input for toolbar attach button */}
        <input
          ref={attachFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => {
            // Delegate to AttachmentBar's upload logic by simulating the same flow
            // Since AttachmentBar manages its own input, we trigger it instead
            // But for the toolbar button, we use this ref
            const files = e.target.files
            if (!files || files.length === 0) return

            const { api } = await import('@/lib/api')
            for (const file of Array.from(files)) {
              const currentTotal = attachments.reduce(
                (sum, a) => sum + (a.size || 0),
                0,
              )
              if (currentTotal + file.size > 10 * 1024 * 1024) {
                alert('Total attachment size cannot exceed 10 MB')
                break
              }

              const formData = new FormData()
              formData.append('file', file)

              try {
                const result = await api.postFormData<{
                  storagePath: string
                  filename: string
                  size: number
                }>(
                  `/email-accounts/${accountId}/attachments`,
                  formData,
                )
                setAttachments((prev) => [
                  ...prev,
                  {
                    filename: result.filename || file.name,
                    storagePath: result.storagePath,
                    contentType: file.type,
                    size: file.size,
                    source: 'upload' as const,
                  },
                ])
              } catch (err) {
                console.error('Upload failed:', err)
              }
            }

            if (attachFileInputRef.current) {
              attachFileInputRef.current.value = ''
            }
          }}
        />
        <AttachmentBar
          attachments={attachments}
          onChange={setAttachments}
          tripId={compose.tripId}
          accountId={accountId}
        />
      </div>
    </div>
  )
}
