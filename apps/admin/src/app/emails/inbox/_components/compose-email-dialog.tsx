'use client'

import { useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSendEmail } from '@/hooks/use-emails'
import { useEmailStore, type ComposeState } from '@/stores/email.store'

interface ComposeEmailDialogProps {
  accountId: string
  compose: ComposeState
}

export function ComposeEmailDialog({ accountId, compose }: ComposeEmailDialogProps) {
  const closeCompose = useEmailStore((s) => s.closeCompose)
  const sendEmail = useSendEmail(accountId)

  const [to, setTo] = useState(
    compose.prefillTo?.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ') || '',
  )
  const [cc, setCc] = useState(
    compose.prefillCc?.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ') || '',
  )
  const [subject, setSubject] = useState(compose.prefillSubject || '')
  const [body, setBody] = useState(compose.prefillBody || '')
  const [showCc, setShowCc] = useState(!!compose.prefillCc?.length)

  function parseAddresses(input: string): { address: string; name?: string }[] {
    if (!input.trim()) return []
    return input.split(',').map((part) => {
      const trimmed = part.trim()
      const match = trimmed.match(/^(.+?)\s*<(.+?)>$/)
      if (match) return { name: match[1]!.trim(), address: match[2]!.trim() }
      return { address: trimmed }
    })
  }

  function handleSend() {
    const toAddresses = parseAddresses(to)
    if (toAddresses.length === 0) return

    sendEmail.mutate(
      {
        to: toAddresses,
        cc: showCc ? parseAddresses(cc) : undefined,
        subject,
        bodyHtml: `<div>${body.replace(/\n/g, '<br>')}</div>`,
        inReplyToEmailId: compose.replyToEmailId,
      },
      { onSuccess: () => closeCompose() },
    )
  }

  const modeLabel = {
    new: 'New Email',
    reply: 'Reply',
    replyAll: 'Reply All',
    forward: 'Forward',
  }[compose.mode]

  return (
    <Dialog open onOpenChange={(open) => !open && closeCompose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modeLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="w-8 text-right text-sm text-muted-foreground">To</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1"
              />
              {!showCc && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowCc(true)}
                >
                  Cc
                </Button>
              )}
            </div>
            {showCc && (
              <div className="flex items-center gap-2">
                <Label className="w-8 text-right text-sm text-muted-foreground">Cc</Label>
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label className="w-8 text-right text-sm text-muted-foreground">Sub</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1"
            />
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            className="min-h-[200px] resize-y"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeCompose}>
              <X className="mr-1 h-4 w-4" />
              Discard
            </Button>
            <Button onClick={handleSend} disabled={sendEmail.isPending || !to.trim()}>
              {sendEmail.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
