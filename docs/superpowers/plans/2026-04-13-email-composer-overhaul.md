# Email Composer Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic textarea compose dialog with a fully-featured, shared email composer with TipTap rich text, CRM contact search tokens, template picker, file attachments, and signature preview.

**Architecture:** One `EmailComposer` component rendered in two containers: full-screen Dialog (Email module) and slide-out Sheet (Trip/Contact views). Context controls pre-fill only — the composer is identical everywhere. Backend extended with attachment support on the existing send endpoint.

**Tech Stack:** TipTap (rich text), ShadCN (Sheet, Popover, Command), Zustand (compose state), React Query (contacts, templates), Nodemailer (attachments)

---

## File Structure

### Create
| File | Responsibility |
|------|---------------|
| `apps/admin/src/components/email-composer/email-composer.tsx` | Main composer: assembles all sub-components, manages local state, handles send |
| `apps/admin/src/components/email-composer/recipient-token-input.tsx` | Token/chip input with CRM contact search dropdown |
| `apps/admin/src/components/email-composer/composer-toolbar.tsx` | TipTap formatting toolbar buttons |
| `apps/admin/src/components/email-composer/tiptap-editor.tsx` | TipTap editor wrapper with extensions |
| `apps/admin/src/components/email-composer/template-picker.tsx` | Popover to browse/search/insert templates |
| `apps/admin/src/components/email-composer/attachment-bar.tsx` | Attachment chips + upload button + trip document picker |
| `apps/admin/src/components/email-composer/signature-preview.tsx` | Read-only signature below divider |
| `apps/admin/src/components/email-composer/compose-dialog.tsx` | Full-screen dialog container (Email module) |
| `apps/admin/src/components/email-composer/compose-panel.tsx` | Slide-out Sheet container (Trip/Contact views) |
| `apps/api/src/email-accounts/dto/email-attachment.dto.ts` | Attachment DTO with validation (uses `storagePath`, not URL — prevents SSRF) |

### Modify
| File | Change |
|------|--------|
| `apps/admin/src/stores/email.store.ts` | Add `tripId`, `contactId` to ComposeState |
| `apps/admin/src/app/emails/inbox/page.tsx` | Replace `ComposeEmailDialog` with `ComposeDialog` |
| `apps/admin/src/hooks/use-emails.ts` | Extend `useSendEmail` DTO with `attachments` field |
| `apps/api/src/email-accounts/dto/send-email.dto.ts` | Add `attachments` array field |
| `apps/api/src/email-accounts/smtp-send.service.ts` | Download attachments from R2 via `StorageService.downloadDocument(storagePath)` + attach via Nodemailer |
| `apps/api/src/email-accounts/email-accounts.controller.ts` | Add `POST /email-accounts/:id/attachments` upload endpoint |
| `apps/admin/src/hooks/use-email-templates.ts` | Add `useRenderTemplate` hook for context-aware rendering |
| `apps/api/src/email/email-templates.controller.ts` | Add `POST /email-templates/:slug/render` endpoint |
| `apps/api/src/email/email-templates.service.ts` | Add `renderWithContext()` using existing `renderTemplate()` + `getTemplateBySlug()` |

### Delete
| File | Reason |
|------|--------|
| `apps/admin/src/app/emails/inbox/_components/compose-email-dialog.tsx` | Replaced by shared `EmailComposer` |

---

### Task 1: Install TipTap and Create Editor Wrapper

**Files:**
- Create: `apps/admin/src/components/email-composer/tiptap-editor.tsx`
- Modify: `apps/admin/package.json` (new deps)

- [ ] **Step 1: Install TipTap dependencies**

```bash
cd apps/admin
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-text-align @tiptap/pm
```

- [ ] **Step 2: Create TipTap editor wrapper**

```typescript
// apps/admin/src/components/email-composer/tiptap-editor.tsx
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { cn } from '@/lib/utils'

interface TipTapEditorProps {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  className?: string
  editable?: boolean
}

export function TipTapEditor({
  content = '',
  onChange,
  placeholder = 'Write your message...',
  className,
  editable = true,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // emails don't need headings
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['paragraph'] }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  })

  return (
    <div className={cn('overflow-y-auto', className)}>
      <EditorContent editor={editor} />
    </div>
  )
}

export { type Editor } from '@tiptap/react'
export { useEditor } from '@tiptap/react'
```

- [ ] **Step 3: Verify it renders**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`
Expected: Clean compile (no errors in new file)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/src/components/email-composer/tiptap-editor.tsx
git commit -m "feat(composer): add TipTap editor wrapper with email-appropriate extensions"
```

---

### Task 2: Composer Toolbar

**Files:**
- Create: `apps/admin/src/components/email-composer/composer-toolbar.tsx`

- [ ] **Step 1: Create toolbar component**

```typescript
// apps/admin/src/components/email-composer/composer-toolbar.tsx
'use client'

import type { Editor } from '@tiptap/react'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Paperclip,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface ComposerToolbarProps {
  editor: Editor | null
  onAttachClick?: () => void
  onTemplateClick?: () => void
}

export function ComposerToolbar({
  editor,
  onAttachClick,
  onTemplateClick,
}: ComposerToolbarProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl) return
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkUrl('')
    setLinkOpen(false)
  }, [editor, linkUrl])

  if (!editor) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 border-b bg-muted/30 px-2 py-1 flex-wrap">
        <ToolbarToggle
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          icon={Bold}
          label="Bold"
        />
        <ToolbarToggle
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          icon={Italic}
          label="Italic"
        />
        <ToolbarToggle
          pressed={editor.isActive('underline')}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          icon={Underline}
          label="Underline"
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarToggle
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          icon={List}
          label="Bullet list"
        />
        <ToolbarToggle
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          icon={ListOrdered}
          label="Numbered list"
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('link')}
              className="h-8 w-8 p-0"
            >
              <Link2 className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="flex gap-1">
              <Input
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyLink()}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={applyLink}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {onAttachClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onAttachClick}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {onTemplateClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-primary"
                onClick={onTemplateClick}
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs">Template</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert email template</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

function ToolbarToggle({
  pressed,
  onPressedChange,
  icon: Icon,
  label,
}: {
  pressed: boolean
  onPressedChange: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={pressed}
          onPressedChange={onPressedChange}
          className="h-8 w-8 p-0"
        >
          <Icon className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/email-composer/composer-toolbar.tsx
git commit -m "feat(composer): add TipTap formatting toolbar with link popover"
```

---

### Task 3: Recipient Token Input

**Files:**
- Create: `apps/admin/src/components/email-composer/recipient-token-input.tsx`

- [ ] **Step 1: Create token input with CRM search**

```typescript
// apps/admin/src/components/email-composer/recipient-token-input.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { useContacts } from '@/hooks/use-contacts'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

export interface RecipientToken {
  address: string
  name?: string
  contactId?: string
}

interface RecipientTokenInputProps {
  label: string
  tokens: RecipientToken[]
  onChange: (tokens: RecipientToken[]) => void
  placeholder?: string
  className?: string
}

export function RecipientTokenInput({
  label,
  tokens,
  onChange,
  placeholder = 'Search contacts or type email...',
  className,
}: RecipientTokenInputProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
  }, 300)

  const { data: contactsData } = useContacts({
    search: debouncedSearch || undefined,
    limit: 8,
    scope: 'all',
  })

  const contacts = contactsData?.data ?? []

  const addToken = useCallback(
    (token: RecipientToken) => {
      // Avoid duplicates by email
      if (tokens.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) return
      onChange([...tokens, token])
      setSearch('')
      setDebouncedSearch('')
      setShowDropdown(false)
      inputRef.current?.focus()
    },
    [tokens, onChange],
  )

  const removeToken = useCallback(
    (index: number) => {
      onChange(tokens.filter((_, i) => i !== index))
    },
    [tokens, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && search.trim()) {
        e.preventDefault()
        const trimmed = search.trim().replace(/,$/, '')
        // Parse "Name <email>" format
        const match = trimmed.match(/^(.+?)\s*<(.+?)>$/)
        if (match) {
          addToken({ name: match[1].trim(), address: match[2].trim() })
        } else if (trimmed.includes('@')) {
          addToken({ address: trimmed })
        }
        // If not a valid email format, ignore (let them use the dropdown)
      }
      if (e.key === 'Backspace' && !search && tokens.length > 0) {
        removeToken(tokens.length - 1)
      }
    },
    [search, tokens, addToken, removeToken],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text')
      if (text.includes(',') || text.includes(';')) {
        e.preventDefault()
        const addresses = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        const newTokens: RecipientToken[] = []
        for (const addr of addresses) {
          const match = addr.match(/^(.+?)\s*<(.+?)>$/)
          if (match) {
            newTokens.push({ name: match[1].trim(), address: match[2].trim() })
          } else if (addr.includes('@')) {
            newTokens.push({ address: addr })
          }
        }
        if (newTokens.length > 0) {
          const unique = newTokens.filter(
            (t) => !tokens.some((ex) => ex.address.toLowerCase() === t.address.toLowerCase()),
          )
          onChange([...tokens, ...unique])
        }
      }
    },
    [tokens, onChange],
  )

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <span className="mt-1.5 text-xs font-medium text-muted-foreground min-w-[28px]">
          {label}:
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {tokens.map((token, i) => (
            <span
              key={`${token.address}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {token.name || token.address}
              <button
                type="button"
                onClick={() => removeToken(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              debouncedSetSearch(e.target.value)
              setShowDropdown(e.target.value.length > 0)
            }}
            onFocus={() => search.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={tokens.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Contact search dropdown */}
      {showDropdown && debouncedSearch && contacts.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur
                if (contact.email) {
                  addToken({
                    address: contact.email,
                    name: contact.displayName,
                    contactId: contact.id,
                  })
                }
              }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(contact.displayName || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{contact.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {contact.email || 'No email'}
                  {contact.contactType && ` · ${contact.contactType}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/email-composer/recipient-token-input.tsx
git commit -m "feat(composer): add recipient token input with CRM contact search"
```

---

### Task 4: Signature Preview

**Files:**
- Create: `apps/admin/src/components/email-composer/signature-preview.tsx`

- [ ] **Step 1: Create signature preview component**

```typescript
// apps/admin/src/components/email-composer/signature-preview.tsx
'use client'

import { useMyProfile } from '@/hooks/use-user-profile'

export function SignaturePreview() {
  const { data: profile } = useMyProfile()
  const signatureConfig = profile?.emailSignatureConfig as any
  const signatureHtml = signatureConfig?.enabled && signatureConfig?.signatureHtml
    ? signatureConfig.signatureHtml
    : null

  if (!signatureHtml) return null

  return (
    <div className="border-t px-4 py-3">
      <div
        className="pointer-events-none select-none opacity-50 text-sm"
        dangerouslySetInnerHTML={{ __html: signatureHtml }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/email-composer/signature-preview.tsx
git commit -m "feat(composer): add read-only signature preview component"
```

---

### Task 5: Template Picker

**Files:**
- Create: `apps/admin/src/components/email-composer/template-picker.tsx`
- Modify: `apps/admin/src/hooks/use-email-templates.ts` (add `useRenderTemplate`)
- Modify: `apps/api/src/email/email-templates.controller.ts` (add render endpoint)
- Modify: `apps/api/src/email/email-templates.service.ts` (add `renderWithContext`)

- [ ] **Step 1: Add backend render endpoint**

Add to `apps/api/src/email/email-templates.controller.ts`, after the existing preview endpoint:

```typescript
@Post(':slug/render')
async renderTemplate(
  @GetAuthContext() auth: AuthContext,
  @Param('slug') slug: string,
  @Body() body: { tripId?: string; contactId?: string; variables?: Record<string, string> },
) {
  return this.emailTemplatesService.renderWithContext(slug, auth.agencyId, {
    tripId: body.tripId,
    contactId: body.contactId,
    agentId: auth.userId,
    variables: body.variables,
  })
}
```

Add to `apps/api/src/email/email-templates.service.ts`:

```typescript
async renderWithContext(
  slug: string,
  agencyId: string,
  context: { tripId?: string; contactId?: string; agentId?: string; variables?: Record<string, string> },
): Promise<{ subject: string; bodyHtml: string; unresolvedVariables: string[] }> {
  // Use existing getTemplateBySlug (NOT findBySlug — that doesn't exist)
  const template = await this.getTemplateBySlug(slug, agencyId)
  if (!template) throw new NotFoundException('Template not found')

  // Use existing renderTemplate which handles {{var::fallback}} syntax
  const rendered = await this.renderTemplate(template, {
    agencyId,
    tripId: context.tripId,
    contactId: context.contactId,
    agentId: context.agentId,
  })

  // Merge any manual variable overrides on top of rendered result
  let subject = rendered.subject || ''
  let bodyHtml = rendered.bodyHtml || ''

  if (context.variables) {
    for (const [key, value] of Object.entries(context.variables)) {
      const pattern = new RegExp(`\\{\\{${key}(?:::.*?)?\\}\\}`, 'g')
      subject = subject.replace(pattern, value)
      bodyHtml = bodyHtml.replace(pattern, value)
    }
  }

  // Find remaining unresolved variables (still have {{ }})
  const unresolvedSet = new Set<string>()
  const varPattern = /\{\{(\w+(?:\.\w+)*)(?:::.*?)?\}\}/g
  let match: RegExpExecArray | null
  while ((match = varPattern.exec(subject + bodyHtml)) !== null) {
    unresolvedSet.add(match[1])
  }

  return { subject, bodyHtml, unresolvedVariables: [...unresolvedSet] }
}
```

- [ ] **Step 2: Add frontend hook**

Add to `apps/admin/src/hooks/use-email-templates.ts`:

```typescript
export function useRenderTemplate() {
  return useMutation({
    mutationFn: (params: {
      slug: string
      tripId?: string
      contactId?: string
      variables?: Record<string, string>
    }) =>
      api.post<{ subject: string; bodyHtml: string; unresolvedVariables: string[] }>(
        `/email-templates/${params.slug}/render`,
        { tripId: params.tripId, contactId: params.contactId, variables: params.variables },
      ),
  })
}
```

- [ ] **Step 3: Create template picker component**

```typescript
// apps/admin/src/components/email-composer/template-picker.tsx
'use client'

import { useState } from 'react'
import { FileText, Search, Loader2 } from 'lucide-react'
import { useEmailTemplates, useRenderTemplate } from '@/hooks/use-email-templates'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TemplatePickerProps {
  tripId?: string
  contactId?: string
  onInsert: (result: { subject: string; bodyHtml: string; unresolvedVariables: string[] }) => void
  children?: React.ReactNode
}

// NOTE: This component has three states:
// 1. Template list (search + browse)
// 2. Template preview (show rendered HTML + "Insert" button)
// 3. Trip picker (when template has trip variables but no tripId context — uses useContactTrips)

export function TemplatePicker({
  tripId,
  contactId,
  onInsert,
  children,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | undefined>(tripId)
  const { data: templates, isLoading } = useEmailTemplates({
    search: search || undefined,
    isActive: true,
  })
  const renderTemplate = useRenderTemplate()

  // Trip picker for when contact context exists but no trip context
  // Uses existing useContactTrips hook from use-contacts.ts
  const needsTripPicker = !tripId && !!contactId

  const handlePreview = (slug: string) => {
    setPreviewSlug(slug)
    // If we have trip context or no contact context, render immediately for preview
    if (tripId || !contactId) {
      renderTemplate.mutate({ slug, tripId, contactId })
    }
  }

  const handleInsert = async () => {
    if (!previewSlug) return
    const result = await renderTemplate.mutateAsync({
      slug: previewSlug,
      tripId: selectedTripId,
      contactId,
    })
    onInsert(result)
    setOpen(false)
    setSearch('')
    setPreviewSlug(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs">Template</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="max-h-64">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="py-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => handleSelect(t.slug)}
                  disabled={renderTemplate.isPending}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {t.category}
                      </Badge>
                      {t.description && (
                        <span className="truncate text-xs text-muted-foreground">
                          {t.description}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No templates found
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Verify compile (frontend + backend)**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`
Run: `pnpm --filter @tailfire/api exec tsc --noEmit 2>&1 | grep template-picker` (verify no new errors from our changes)

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/email-composer/template-picker.tsx apps/admin/src/hooks/use-email-templates.ts apps/api/src/email/email-templates.controller.ts apps/api/src/email/email-templates.service.ts
git commit -m "feat(composer): add template picker with context-aware variable resolution"
```

---

### Task 6: Attachment Bar + Backend Support

**Files:**
- Create: `apps/admin/src/components/email-composer/attachment-bar.tsx`
- Create: `apps/api/src/email-accounts/dto/email-attachment.dto.ts`
- Modify: `apps/api/src/email-accounts/dto/send-email.dto.ts`
- Modify: `apps/api/src/email-accounts/smtp-send.service.ts`
- Modify: `apps/admin/src/hooks/use-emails.ts`

- [ ] **Step 1: Create attachment DTO**

```typescript
// apps/api/src/email-accounts/dto/email-attachment.dto.ts
import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator'

export class EmailAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string

  @IsString()
  storagePath!: string // R2 storage path (NOT a URL — prevents SSRF)

  @IsOptional()
  @IsString()
  contentType?: string

  @IsOptional()
  @IsNumber()
  size?: number
}
```

- [ ] **Step 2: Update SendEmailDto to accept attachments**

Add to `apps/api/src/email-accounts/dto/send-email.dto.ts`:

```typescript
import { EmailAttachmentDto } from './email-attachment.dto'

// Add to SendEmailDto class:
@IsOptional()
@IsArray()
@ValidateNested({ each: true })
@Type(() => EmailAttachmentDto)
attachments?: EmailAttachmentDto[]
```

- [ ] **Step 3: Update SmtpSendService to fetch and attach files**

In `apps/api/src/email-accounts/smtp-send.service.ts`, in the `send()` method, add attachment handling before `transport.sendMail(mailOptions)`:

```typescript
// Inject StorageService in SmtpSendService constructor:
// private readonly storageService: StorageService

// After building mailOptions, before sendMail:
if (dto.attachments && dto.attachments.length > 0) {
  const attachmentPromises = dto.attachments.map(async (att) => {
    try {
      // Use StorageService.downloadDocument — reads from R2 by storage path (no SSRF risk)
      const buffer = await this.storageService.downloadDocument(att.storagePath)
      return {
        filename: att.filename,
        content: buffer,
        contentType: att.contentType || 'application/octet-stream',
      }
    } catch (err: any) {
      this.logger.warn(`Failed to download attachment ${att.filename} (${att.storagePath}): ${err.message}`)
      return null
    }
  })
  const resolved = (await Promise.all(attachmentPromises)).filter(Boolean)
  if (resolved.length > 0) {
    mailOptions.attachments = resolved as nodemailer.Attachment[]
  }
}
```

- [ ] **Step 4: Update frontend useSendEmail DTO**

In `apps/admin/src/hooks/use-emails.ts`, update the `useSendEmail` mutation DTO type to include:

```typescript
attachments?: { filename: string; storagePath: string; contentType?: string; size?: number }[]
```

- [ ] **Step 5: Create AttachmentBar frontend component**

```typescript
// apps/admin/src/components/email-composer/attachment-bar.tsx
'use client'

import { useRef } from 'react'
import { Paperclip, Upload, X, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'

export interface AttachmentFile {
  filename: string
  storagePath: string // R2 path, not URL
  contentType?: string
  size?: number
  source: 'upload' | 'trip-document'
}

interface AttachmentBarProps {
  attachments: AttachmentFile[]
  onChange: (attachments: AttachmentFile[]) => void
  tripId?: string
  accountId: string
}

export function AttachmentBar({
  attachments,
  onChange,
  tripId,
  accountId,
}: AttachmentBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      // Check total size (10 MB limit)
      const currentTotal = attachments.reduce((sum, a) => sum + (a.size || 0), 0)
      if (currentTotal + file.size > 10 * 1024 * 1024) {
        alert('Total attachment size cannot exceed 10 MB')
        break
      }

      const formData = new FormData()
      formData.append('file', file)

      try {
        // Upload endpoint returns storagePath (R2 key), not a URL
        const result = await api.postFormData<{ storagePath: string; filename: string; size: number }>(
          `/email-accounts/${accountId}/attachments`,
          formData,
        )
        onChange([
          ...attachments,
          {
            filename: result.filename || file.name,
            storagePath: result.storagePath,
            contentType: file.type,
            size: file.size,
            source: 'upload',
          },
        ])
      } catch (err) {
        console.error('Upload failed:', err)
      }
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index))
  }

  const totalSize = attachments.reduce((sum, a) => sum + (a.size || 0), 0)

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Attach button (used by toolbar) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Paperclip className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Upload from computer
          </DropdownMenuItem>
          {/* Trip documents - future enhancement when trip document API exists */}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/30 px-3 py-2">
          {attachments.map((att, i) => (
            <div
              key={`${att.filename}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
            >
              <File className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{att.filename}</span>
              {att.size && (
                <span className="text-muted-foreground">
                  ({(att.size / 1024).toFixed(0)} KB)
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/10"
              >
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {(totalSize / (1024 * 1024)).toFixed(1)} / 10 MB
          </span>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/email-accounts/dto/email-attachment.dto.ts apps/api/src/email-accounts/dto/send-email.dto.ts apps/api/src/email-accounts/smtp-send.service.ts apps/admin/src/hooks/use-emails.ts apps/admin/src/components/email-composer/attachment-bar.tsx
git commit -m "feat(composer): add attachment support — upload + backend fetch from R2"
```

---

### Task 7: Extend Compose State

**Files:**
- Modify: `apps/admin/src/stores/email.store.ts`

- [ ] **Step 1: Add tripId and contactId to ComposeState**

In `apps/admin/src/stores/email.store.ts`, update the `ComposeState` interface:

```typescript
export interface ComposeState {
  mode: ComposeMode
  replyToEmailId?: string
  prefillTo?: { address: string; name?: string }[]
  prefillCc?: { address: string; name?: string }[]
  prefillSubject?: string
  prefillBody?: string
  // Context for variable resolution + attachments
  tripId?: string
  contactId?: string
}
```

No other changes needed — the store already has `openCompose(state: ComposeState)` that accepts the full interface.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/stores/email.store.ts
git commit -m "feat(composer): extend ComposeState with tripId and contactId"
```

---

### Task 8: Main EmailComposer Component

**Files:**
- Create: `apps/admin/src/components/email-composer/email-composer.tsx`

- [ ] **Step 1: Create the main composer component**

```typescript
// apps/admin/src/components/email-composer/email-composer.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { EditorContent } from '@tiptap/react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSendEmail } from '@/hooks/use-emails'
import { useEmailStore, type ComposeState } from '@/stores/email.store'
import { RecipientTokenInput, type RecipientToken } from './recipient-token-input'
import { ComposerToolbar } from './composer-toolbar'
import { TemplatePicker } from './template-picker'
import { AttachmentBar, type AttachmentFile } from './attachment-bar'
import { SignaturePreview } from './signature-preview'
import { cn } from '@/lib/utils'

interface EmailComposerProps {
  accountId: string
  compose: ComposeState
  onSent?: () => void
  className?: string
}

export function EmailComposer({ accountId, compose, onSent, className }: EmailComposerProps) {
  const closeCompose = useEmailStore((s) => s.closeCompose)
  const sendEmail = useSendEmail(accountId)

  // Recipients
  const [toTokens, setToTokens] = useState<RecipientToken[]>(
    compose.prefillTo?.map((r) => ({ address: r.address, name: r.name })) ?? [],
  )
  const [ccTokens, setCcTokens] = useState<RecipientToken[]>(
    compose.prefillCc?.map((r) => ({ address: r.address, name: r.name })) ?? [],
  )
  const [bccTokens, setBccTokens] = useState<RecipientToken[]>([])
  const [showCcBcc, setShowCcBcc] = useState(
    (compose.prefillCc?.length ?? 0) > 0,
  )

  // Subject
  const [subject, setSubject] = useState(compose.prefillSubject ?? '')

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Placeholder.configure({ placeholder: 'Write your message...' }),
      TextAlign.configure({ types: ['paragraph'] }),
    ],
    content: compose.prefillBody ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  })

  // Template insert handler
  const handleTemplateInsert = useCallback(
    (result: { subject: string; bodyHtml: string; unresolvedVariables: string[] }) => {
      if (!editor) return
      editor.commands.setContent(result.bodyHtml)
      if (!subject && result.subject) {
        setSubject(result.subject)
      }
    },
    [editor, subject],
  )

  // Attachment button reference
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)

  // Send handler
  const handleSend = useCallback(async () => {
    if (toTokens.length === 0 || !subject.trim() || !editor) return

    await sendEmail.mutateAsync({
      to: toTokens.map((t) => ({ address: t.address, name: t.name })),
      cc: ccTokens.length > 0 ? ccTokens.map((t) => ({ address: t.address, name: t.name })) : undefined,
      bcc: bccTokens.length > 0 ? bccTokens.map((t) => ({ address: t.address, name: t.name })) : undefined,
      subject: subject.trim(),
      bodyHtml: editor.getHTML(),
      inReplyToEmailId: compose.replyToEmailId,
      attachments: attachments.length > 0
        ? attachments.map((a) => ({ filename: a.filename, storagePath: a.storagePath, contentType: a.contentType, size: a.size }))
        : undefined,
    })

    closeCompose()
    onSent?.()
  }, [toTokens, ccTokens, bccTokens, subject, editor, attachments, compose, sendEmail, closeCompose, onSent])

  const canSend = toTokens.length > 0 && subject.trim().length > 0

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h3 className="text-sm font-semibold">
          {compose.mode === 'reply' || compose.mode === 'replyAll'
            ? 'Reply'
            : compose.mode === 'forward'
              ? 'Forward'
              : 'New Email'}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={closeCompose}>
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!canSend || sendEmail.isPending}
          >
            {sendEmail.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>

      {/* Recipients */}
      <RecipientTokenInput label="To" tokens={toTokens} onChange={setToTokens} />
      {showCcBcc ? (
        <>
          <RecipientTokenInput label="Cc" tokens={ccTokens} onChange={setCcTokens} />
          <RecipientTokenInput label="Bcc" tokens={bccTokens} onChange={setBccTokens} />
        </>
      ) : (
        <div className="flex justify-end px-3 -mt-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowCcBcc(true)}
          >
            Cc / Bcc
          </button>
        </div>
      )}

      {/* Subject */}
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <span className="text-xs font-medium text-muted-foreground min-w-[28px]">Subj:</span>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="border-0 p-0 h-auto text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      {/* Toolbar */}
      <ComposerToolbar
        editor={editor}
        onTemplateClick={undefined} // template button handled inline below
      />

      {/* Template picker - integrated into toolbar area */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-2 py-0.5 shrink-0">
        <TemplatePicker
          tripId={compose.tripId}
          contactId={compose.contactId}
          onInsert={handleTemplateInsert}
        />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
        <SignaturePreview />
      </div>

      {/* Attachments */}
      <AttachmentBar
        attachments={attachments}
        onChange={setAttachments}
        tripId={compose.tripId}
        accountId={accountId}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/email-composer/email-composer.tsx
git commit -m "feat(composer): main EmailComposer component assembling all sub-components"
```

---

### Task 9: Compose Dialog (Full-screen — Email Module)

**Files:**
- Create: `apps/admin/src/components/email-composer/compose-dialog.tsx`

- [ ] **Step 1: Create full-screen dialog container**

```typescript
// apps/admin/src/components/email-composer/compose-dialog.tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEmailStore } from '@/stores/email.store'
import { EmailComposer } from './email-composer'

interface ComposeDialogProps {
  accountId: string
}

export function ComposeDialog({ accountId }: ComposeDialogProps) {
  const compose = useEmailStore((s) => s.compose)
  const closeCompose = useEmailStore((s) => s.closeCompose)

  if (!compose || !accountId) return null

  return (
    <Dialog open={!!compose} onOpenChange={(open) => !open && closeCompose()}>
      <DialogContent className="max-w-3xl h-[80vh] p-0 flex flex-col gap-0">
        <VisuallyHidden>
          <DialogTitle>Compose Email</DialogTitle>
        </VisuallyHidden>
        <EmailComposer
          accountId={accountId}
          compose={compose}
          className="h-full"
        />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/email-composer/compose-dialog.tsx
git commit -m "feat(composer): full-screen compose dialog container for Email module"
```

---

### Task 10: Compose Panel (Slide-out — Trip/Contact Views)

**Files:**
- Create: `apps/admin/src/components/email-composer/compose-panel.tsx`

- [ ] **Step 1: Create slide-out panel container**

```typescript
// apps/admin/src/components/email-composer/compose-panel.tsx
'use client'

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEmailStore } from '@/stores/email.store'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { EmailComposer } from './email-composer'

export function ComposePanel() {
  const compose = useEmailStore((s) => s.compose)
  const closeCompose = useEmailStore((s) => s.closeCompose)
  const { data: accounts } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  if (!compose || !accountId) return null

  return (
    <Sheet open={!!compose} onOpenChange={(open) => !open && closeCompose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] p-0 flex flex-col">
        <VisuallyHidden>
          <SheetTitle>Compose Email</SheetTitle>
        </VisuallyHidden>
        <EmailComposer
          accountId={accountId}
          compose={compose}
          className="h-full"
        />
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/email-composer/compose-panel.tsx
git commit -m "feat(composer): slide-out compose panel for Trip/Contact views"
```

---

### Task 11: Wire Up Email Module

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/page.tsx`

- [ ] **Step 1: Replace old ComposeEmailDialog with new ComposeDialog**

In `apps/admin/src/app/emails/inbox/page.tsx`:

1. Replace import:
```typescript
// Remove:
import { ComposeEmailDialog } from './_components/compose-email-dialog'
// Add:
import { ComposeDialog } from '@/components/email-composer/compose-dialog'
```

2. Replace usage at bottom of JSX (around line 383):
```typescript
// Remove:
{compose && accountId && (
  <ComposeEmailDialog accountId={accountId} compose={compose} />
)}
// Replace with:
{accountId && <ComposeDialog accountId={accountId} />}
```

- [ ] **Step 2: Delete old compose dialog**

```bash
rm apps/admin/src/app/emails/inbox/_components/compose-email-dialog.tsx
```

- [ ] **Step 3: Verify page loads**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/emails/inbox/page.tsx
git rm apps/admin/src/app/emails/inbox/_components/compose-email-dialog.tsx
git commit -m "feat(composer): wire new ComposeDialog into Email module, remove old dialog"
```

---

### Task 12: Wire Up Trip and Contact Views

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/page.tsx` (or appropriate trip detail component)
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx` (or appropriate contact detail component)

- [ ] **Step 1: Add ComposePanel to Trip detail page**

Find the trip detail page and add an "Email" button + ComposePanel. The exact file may be `apps/admin/src/app/trips/[id]/page.tsx` or a layout/component within it.

Add import:
```typescript
import { ComposePanel } from '@/components/email-composer/compose-panel'
import { useEmailStore } from '@/stores/email.store'
```

Add email button in the trip header actions area. Note: TripWithDetailsResponseDto has `primaryContact` (ContactResponseDto) and `travelers` (TripTravelerResponseDto[]), NOT `contacts`:

```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    // Derive recipients from primaryContact (trip DTO shape)
    const recipients: { address: string; name?: string }[] = []
    if (trip.primaryContact?.email) {
      recipients.push({ address: trip.primaryContact.email, name: trip.primaryContact.displayName })
    }
    useEmailStore.getState().openCompose({
      mode: 'new',
      tripId: trip.id,
      contactId: trip.primaryContactId ?? undefined,
      prefillTo: recipients,
      prefillSubject: trip.name || '',
    })
  }}
>
  <Mail className="mr-1.5 h-4 w-4" />
  Email
</Button>
```

Add at bottom of page JSX:
```typescript
<ComposePanel />
```

- [ ] **Step 2: Add ComposePanel to Contact detail page**

Same pattern for the contact detail page:

```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => useEmailStore.getState().openCompose({
    mode: 'new',
    contactId: contact.id,
    prefillTo: contact.email ? [{ address: contact.email, name: contact.displayName }] : [],
  })}
>
  <Mail className="mr-1.5 h-4 w-4" />
  Email
</Button>
```

Add at bottom:
```typescript
<ComposePanel />
```

- [ ] **Step 3: Verify compile**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/trips/ apps/admin/src/app/contacts/
git commit -m "feat(composer): wire ComposePanel into Trip and Contact detail views"
```

---

### Task 13: Final Integration Testing

- [ ] **Step 1: Test compose from Email module**

1. Navigate to `/emails/inbox`
2. Click Compose button
3. Verify: full-screen dialog opens with TipTap editor, recipient tokens, toolbar, template picker, attachment button, signature preview
4. Type a contact name in To field → verify CRM search dropdown appears
5. Select a contact → verify token/chip added
6. Type a raw email address + Enter → verify token added
7. Click Template → verify picker opens with searchable templates
8. Click Send → verify email sends successfully

- [ ] **Step 2: Test compose from Trip view**

1. Navigate to a trip detail page
2. Click Email button
3. Verify: slide-out panel opens with same full composer
4. Verify: To field pre-filled with trip contacts
5. Verify: Subject pre-filled with trip name
6. Verify: template picker has tripId context (variables resolve)

- [ ] **Step 3: Test compose from Contact view**

1. Navigate to a contact detail page
2. Click Email button
3. Verify: slide-out panel opens
4. Verify: To field pre-filled with contact email
5. Insert a template with trip variables → verify unresolved `{{variables}}` remain editable

- [ ] **Step 4: Test reply/forward from Email module**

1. Open an email in the reader
2. Click Reply → verify composer opens with prefilled To, Subject (Re:), quoted body
3. Click Forward → verify Subject (Fwd:), body forwarded

- [ ] **Step 5: Push to preview for deployment testing**

```bash
git checkout -b feature/email-composer-overhaul
git push -u origin feature/email-composer-overhaul
git checkout preview && git merge feature/email-composer-overhaul --no-edit && git push
git checkout feature/email-composer-overhaul
```
