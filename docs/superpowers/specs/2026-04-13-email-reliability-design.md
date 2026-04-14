# Email Module Reliability Overhaul Design

**Date:** 2026-04-13
**Status:** Approved (Codex validated)
**Issue:** #196

## Overview

Fix the email body loading reliability by fetching the full message source during sync instead of lazy-loading on demand. Emails will be complete (bodyHtml, bodyText, snippet) when synced — no more "Loading..." state or null bodies.

## Problem

- Sync fetches metadata only (envelope, flags, bodyStructure). Body is lazy-loaded via a separate IMAP connection when the user opens an email.
- `client.download()` returns undefined for some UIDs → body stays null → "Email body not yet loaded. Loading..." shown permanently.
- Each lazy body fetch opens a new short-lived IMAP connection — slow and error-prone.

## Solution: Eager Body Parsing During Sync

### What Changes

**In `syncFolder()` — the fetch query:**
```typescript
// Current:
client.fetch(fetchRange, {
  envelope: true,
  bodyStructure: true,
  flags: true,
  uid: true,
  internalDate: true,
}, { uid: true })

// New — add source:
client.fetch(fetchRange, {
  envelope: true,
  bodyStructure: true,
  flags: true,
  uid: true,
  internalDate: true,
  source: true,  // Full RFC822 message
  size: true,     // Message size for threshold check
}, { uid: true })
```

**In `upsertEmailFromImap()` — parse body:**
1. If `msg.source` exists and message size < 1MB threshold:
   - Parse with `postal-mime`
   - Extract `bodyHtml`, `bodyText`
   - Generate snippet from bodyText (first 200 chars)
   - Store in DB alongside metadata
2. If `msg.source` is missing or message too large:
   - Store with null body (legacy lazy-load fallback handles it)

**Shared parse helper:**
```typescript
private async parseMessageSource(source: Buffer): Promise<{
  bodyHtml: string | null
  bodyText: string | null
  snippet: string | null
}> {
  const { default: PostalMime } = await import('postal-mime')
  const parser = new PostalMime()
  const parsed = await parser.parse(source)
  const bodyHtml = parsed.html || null
  const bodyText = parsed.text || null
  const snippet = bodyText
    ? bodyText.substring(0, 200).replace(/\s+/g, ' ').trim()
    : null
  return { bodyHtml, bodyText, snippet }
}
```

This helper is reused by both `upsertEmailFromImap()` and the existing `fetchEmailBody()` fallback.

### Batch Size

Reduce from 50 to 25 messages per batch. Body download adds ~200ms per message, so 25 messages ≈ 5s per sync cycle (acceptable for 2-min background interval).

Both sync paths updated:
- Background INBOX sync: `batchSize: 25` (was 100, but capped by mode)
- On-demand folder sync: default `batchSize: 25` (was 50)

### Fallback for Legacy Emails

`fetchEmailBody()` stays as-is for emails synced before this change (null body). The controller's lazy trigger at line 259 continues to work. No migration needed — old emails get their body on first open.

### Frontend Fix

Change the "Loading..." text to be accurate:
- If body is being fetched: show spinner
- If body fetch returned null (permanently unfetchable): show "Email body unavailable" instead of infinite "Loading..."

### CID Inline Images

**Not in this scope.** CID images continue to show the SVG placeholder. Codex confirmed that storing data URIs in bodyHtml causes unacceptable DB bloat. CID resolution (via attachment records + URL rewriting) is a separate follow-up.

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/email-accounts/imap-sync.service.ts` | Add `source: true, size: true` to fetch query. Add `parseMessageSource()` helper. Call in `upsertEmailFromImap()`. Reduce batch sizes. |
| `apps/admin/src/app/emails/inbox/_components/email-reader.tsx` | Change "Loading..." to "Email body unavailable" for permanently null bodies |

## What Doesn't Change

- Sync modes (incremental/hydrate_recent/hydrate_older)
- Background sync interval (2 min)
- IMAP connection lifecycle
- Email list/folder structure
- Send flow
- CID image handling (stays as placeholder)

## Size Threshold

Messages over 1MB skip body parsing during sync. These are typically emails with large inline content or encoded attachments. They fall back to lazy loading via `fetchEmailBody()`.

## Not in Scope

- CID image resolution (follow-up)
- Connection pooling (not needed if sync is reliable)
- Attachment download improvements
- Email-CRM linking
