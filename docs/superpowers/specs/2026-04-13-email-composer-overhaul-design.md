# Email Composer Overhaul Design

**Date:** 2026-04-13
**Status:** Approved

## Overview

Replace the basic textarea compose dialog with a fully-featured, shared email composer. One component used across all contexts (Email module, Trips, Contacts) with context-aware pre-fill. TipTap rich text editor, CRM contact search in recipient fields, template picker with variable resolution, file attachments with trip document integration, and signature preview.

## Core Principle

**EmailComposer is identical everywhere.** Context only controls pre-fill (recipients, subject, available variables). The agent can always change everything. The container (full-screen dialog vs slide-out panel) is the only difference.

## 1. Containers

### Email Module (`/emails/inbox`)
- Full-screen dialog (modal overlay)
- Spacious layout — Gmail-like compose experience
- Opened via compose button or reply/forward actions

### Trip / Contact Views
- Slide-out panel (Sheet component from ShadCN)
- Agent sees trip/contact context alongside the composer
- Same full composer features — not a stripped-down version

Both containers render the same `EmailComposer` component. The container passes a `ComposeContext` prop that controls pre-fill and variable resolution.

## 2. EmailComposer Component

### Props
```typescript
interface EmailComposerProps {
  accountId: string
  context?: ComposeContext
  onSend?: () => void
  onDiscard?: () => void
}

interface ComposeContext {
  mode: 'new' | 'reply' | 'replyAll' | 'forward'
  // Pre-fill (editable by agent)
  prefillTo?: { address: string; name?: string }[]
  prefillCc?: { address: string; name?: string }[]
  prefillSubject?: string
  prefillBody?: string
  // Context for variable resolution
  tripId?: string
  contactId?: string
  // Reply threading
  replyToEmailId?: string
}
```

### Sub-components

| Component | Responsibility |
|-----------|---------------|
| `RecipientTokenInput` | Token/chip input with CRM contact search + raw email entry |
| `ComposerToolbar` | TipTap formatting toolbar: Bold, Italic, Underline, Lists, Link, Attach, Template |
| `TipTapEditor` | Rich text editor, outputs HTML |
| `TemplatePicker` | Popover to browse/search templates, inserts rendered content |
| `AttachmentBar` | File chips with upload + trip document picker |
| `SignaturePreview` | Read-only signature below divider (cosmetic — server appends real one) |

### File Structure
```
apps/admin/src/components/email-composer/
├── email-composer.tsx          # Main composer component
├── recipient-token-input.tsx   # Token input with CRM search
├── composer-toolbar.tsx        # TipTap toolbar buttons
├── tiptap-editor.tsx           # TipTap editor wrapper
├── template-picker.tsx         # Template browse/search/insert
├── attachment-bar.tsx          # Attachment list + upload/picker
├── signature-preview.tsx       # Read-only signature display
├── compose-dialog.tsx          # Full-screen dialog container (Email module)
└── compose-panel.tsx           # Slide-out panel container (Trip/Contact)
```

Placed in `components/` (not inside `/emails/inbox/`) because this is a shared component used across routes.

## 3. Recipient Token Input

### Behavior
- Type to search CRM contacts by name, email, or phone
- Debounced search (300ms) hits existing contact search API
- Results dropdown shows: avatar, name, email, role (Client/Lead/etc.)
- Click result → adds as a token/chip with contact name
- Type a raw email address + Enter/comma → adds as a plain email token
- Tokens are removable (× button)
- Supports To, Cc, Bcc fields (Cc/Bcc toggle, hidden by default)
- Paste comma-separated emails → creates multiple tokens

### API
Uses existing `GET /contacts?search=` endpoint. No new backend work needed.

## 4. Rich Text Editor (TipTap)

### Extensions
- `StarterKit` (bold, italic, headings, lists, blockquote, code)
- `Underline`
- `Link` (with URL input popover)
- `Placeholder` ("Write your message...")
- `TextAlign` (left, center, right)

### Toolbar Buttons
Bold | Italic | Underline | — | Bullet List | Ordered List | — | Link | Attach | — | Template

### Output
- `editor.getHTML()` returns clean HTML for the `bodyHtml` field in the send DTO
- No Markdown conversion — HTML in, HTML out

### New Dependency
```
pnpm --filter @tailfire/admin add @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-text-align @tiptap/pm
```

## 5. Template Picker

### UI
- Triggered by "Template" button in toolbar
- Opens a Popover (not a modal — stays in context)
- Search bar at top (filters by name/description)
- Template list with: name, category badge, variable count
- Click template → preview panel shows rendered HTML
- "Insert" button applies template to editor

### Variable Resolution
Resolution is context-aware with graceful fallback:

| Context | Auto-resolves | Missing variables |
|---------|--------------|-------------------|
| From Trip view | All trip + contact variables | N/A — full context available |
| From Contact view | Contact variables | Trip variables → show trip picker (contact's trips) |
| From Email module | None initially | Contact/trip variables → stay as `{{variable}}` for manual editing |

### Resolution Flow
1. Agent selects template
2. System checks which variables the template uses
3. Resolves what it can from `ComposeContext` (tripId, contactId)
4. If trip variables exist but no tripId: show a trip picker dropdown (filtered to the contact's trips if contactId is available)
5. Unresolved variables remain as visible `{{handlebars}}` in the editor — agent edits inline
6. Template subject fills the subject field if it's empty

### API
Uses existing `GET /email-templates` for listing and `POST /email-templates/{slug}/render` for variable resolution. May need a new render endpoint that accepts context (tripId, contactId) and returns resolved HTML without sending.

## 6. Attachments

### Two Sources

**Local upload:**
- Standard file input triggered by "Attach" button
- Files uploaded to R2 via existing storage service
- Max 10 MB per email total

**Trip documents:**
- "Attach" button dropdown includes "Trip documents" option (only when tripId is in context)
- Opens a checklist of existing trip documents from R2
- Documents are already stored — no re-upload needed, just reference the R2 path
- Shows: filename, size, upload date

### Attachment Bar
- Displayed below the editor (above signature)
- Each attachment is a chip: icon + filename + size + remove button
- Trip documents shown with folder icon, uploads with computer icon
- Total size indicator

### Backend Changes
- `SendEmailDto` needs an `attachments` field: `{ filename: string; url: string; contentType: string }[]`
- `SmtpSendService` fetches attachment content from R2 URLs and attaches via Nodemailer's `attachments` option
- Need a `GET /trips/:id/documents` endpoint if one doesn't exist (list R2 files for a trip)

## 7. Signature Preview

- Fetched from `useMyProfile()` → `emailSignatureConfig.signatureHtml`
- Rendered below a light divider in the editor area
- Greyed out / reduced opacity to indicate non-editable
- Cosmetic only — the server still appends the real signature on send
- Hidden if user has no signature configured

## 8. Compose State Management

### Zustand Store (existing `email.store.ts`)
Extend the existing `ComposeState` to include context:

```typescript
interface ComposeState {
  mode: 'new' | 'reply' | 'replyAll' | 'forward'
  replyToEmailId?: string
  prefillTo?: { address: string; name?: string }[]
  prefillCc?: { address: string; name?: string }[]
  prefillSubject?: string
  prefillBody?: string
  // New: context for variable resolution + attachments
  tripId?: string
  contactId?: string
}
```

### Opening Compose from Different Contexts

**Email module:**
```typescript
openCompose({ mode: 'new' })
openCompose({ mode: 'reply', replyToEmailId, prefillTo, prefillSubject, prefillBody })
```

**Trip page:**
```typescript
openCompose({
  mode: 'new',
  tripId: trip.id,
  contactId: trip.primaryContactId,
  prefillTo: trip.contacts.map(c => ({ address: c.email, name: c.displayName })),
  prefillSubject: trip.name,
})
```

**Contact page:**
```typescript
openCompose({
  mode: 'new',
  contactId: contact.id,
  prefillTo: [{ address: contact.email, name: contact.displayName }],
})
```

## 9. Send Flow

1. Agent clicks "Send"
2. Frontend collects: recipients (tokens → address objects), subject, `editor.getHTML()`, attachments, replyToEmailId
3. Calls `POST /email-accounts/{id}/send` with extended DTO
4. Backend: builds body (content + signature + footer), attaches files, sends via SMTP
5. Frontend: invalidates queries, closes composer, shows toast

## 10. Files to Create / Modify

### Create
- `apps/admin/src/components/email-composer/email-composer.tsx`
- `apps/admin/src/components/email-composer/recipient-token-input.tsx`
- `apps/admin/src/components/email-composer/composer-toolbar.tsx`
- `apps/admin/src/components/email-composer/tiptap-editor.tsx`
- `apps/admin/src/components/email-composer/template-picker.tsx`
- `apps/admin/src/components/email-composer/attachment-bar.tsx`
- `apps/admin/src/components/email-composer/signature-preview.tsx`
- `apps/admin/src/components/email-composer/compose-dialog.tsx`
- `apps/admin/src/components/email-composer/compose-panel.tsx`

### Modify
- `apps/admin/src/stores/email.store.ts` — extend ComposeState with tripId/contactId
- `apps/admin/src/app/emails/inbox/page.tsx` — use new ComposeDialog instead of old ComposeEmailDialog
- `apps/admin/src/app/trips/[id]/page.tsx` — add "Email" button that opens ComposePanel
- `apps/admin/src/app/contacts/[id]/page.tsx` — add "Email" button that opens ComposePanel
- `apps/admin/src/hooks/use-emails.ts` — extend useSendEmail DTO for attachments
- `apps/api/src/email-accounts/dto/send-email.dto.ts` — add attachments field
- `apps/api/src/email-accounts/smtp-send.service.ts` — fetch and attach files from R2

### Delete
- `apps/admin/src/app/emails/inbox/_components/compose-email-dialog.tsx` (replaced by shared component)

## 11. Not in Scope
- Draft saving / auto-save (future enhancement)
- Scheduled send (future enhancement)
- Inline image embedding in editor (images via attachment only)
- Email tracking / read receipts
- Multiple email account selection (uses first active account)
- CID inline image resolution for received emails (existing limitation)
