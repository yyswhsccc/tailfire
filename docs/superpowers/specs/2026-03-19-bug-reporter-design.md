# Bug Reporter - Design Spec

**Date:** 2026-03-19
**Status:** Approved

## Overview

In-app bug/issue reporter that allows admin users to submit bug reports, feature requests, and questions directly from the platform. Reports are created as GitHub issues in `Systemsaholic/tailfire` with auto-captured context (screenshots, console logs, page URL, user info).

## Trigger

A new "Report a Bug" menu item in the existing help (?) dropdown in `top-nav.tsx`. Clicking it:
1. Captures the current viewport screenshot via `html2canvas` **before** opening the dialog (to avoid capturing the overlay)
2. Opens a shadcn Dialog modal with the screenshot already attached

## Modal Fields

| Field | Type | Source | Required |
|-------|------|--------|----------|
| Title | Text input | User types | Yes |
| Description | Textarea | User types | Yes |
| Type | Select: Bug / Feature / Question | User selects | Yes |
| Page URL | Read-only text | Auto-captured via `window.location.href` | Auto |
| Screenshot | Image preview + upload zone | Auto-captured via `html2canvas` on modal open + manual drag/drop/paste | No |
| Console Logs | Collapsible read-only preview | Auto-captured: last 50 `console.error` + `console.warn` entries | Auto |
| Reporter | Not in form | Derived server-side from JWT via `@GetAuthContext()` | Auto |

## Architecture

```
Client (Help Dropdown -> "Report a Bug" click)
  |-- 1. html2canvas -> screenshot blob BEFORE dialog opens
  |-- 2. Open dialog with screenshot pre-attached
  |-- 3. ConsoleCapture provider -> last 50 error/warn lines
  |-- 4. User fills title, description, type
  |-- 5. Optional: manual screenshot upload (drag/drop/paste)
  |
  v
POST /api/v1/bug-reports (multipart/form-data)
  |-- NestJS BugReportsController
  |-- @UseGuards(ThrottlerGuard) + @Throttle({ default: { limit: 10, ttl: 3600000 } })
  |-- @UseInterceptors(FilesInterceptor('screenshots', 3, { limits, fileFilter }))
  |-- Validates payload via CreateBugReportDto (class-validator)
  |-- Reporter derived from @GetAuthContext() (NOT from request body)
  |-- Server-side sanitization: truncate + redact title/description/consoleLogs
  |-- Re-validates file MIME types + sizes in service layer before upload
  |-- Uploads screenshot(s) to media StorageProvider -> public URLs (unguessable paths)
  |-- Creates GitHub issue via Octokit (singleton, injected via ConfigService)
  |     |-- Title: "[Bug] Title" / "[Feature] Title" / "[Question] Title"
  |     |-- Body: structured markdown (see template below)
  |     |-- Labels: "bug" | "enhancement" | "question"
  |     |-- Repo: Systemsaholic/tailfire
  |-- Returns { issueUrl: string, issueNumber: number } to client
  |
Client shows sonner toast with link to GitHub issue
```

## Console Capture Strategy

A `ConsoleCapture` React context provider wraps the app (added to `providers.tsx`). On mount, it patches `console.error` and `console.warn` to buffer entries into a ring buffer of max 50 entries. Each entry stores:

- `level`: "error" | "warn"
- `timestamp`: ISO string
- `message`: stringified arguments (truncated to 500 chars per entry)

Stringification uses `try { JSON.stringify(args) } catch { String(args) }` to handle circular references and Error objects. Error stack traces are preserved.

The original console methods are preserved and still called. On unmount, patches are restored.

**React Strict Mode safety:** The patch/unpatch logic must be idempotent — a `useRef` flag prevents double-wrapping when React mounts/unmounts/remounts in development strict mode. The ref tracks whether patches are currently active.

The provider exposes a `getConsoleLogs()` function via context that the modal reads when opened.

**Provider placement:** `ConsoleCaptureProvider` is placed just inside `QueryClientProvider` but outside `AuthProvider` in `providers.tsx`, so auth errors are also captured.

**Sensitive data filtering:** Before embedding logs in the GitHub issue, the service strips lines matching patterns: `Bearer`, `token=`, `password`, `secret`, `apikey`, `authorization`. The user can also review and remove individual log entries in the modal before submitting.

## Screenshot Strategy

**Auto-capture:** Screenshot is captured in the `onClick` handler of the "Report a Bug" menu item. The sequence is: (1) close the dropdown menu, (2) wait one frame for the dropdown overlay to unmount, (3) capture via `html2canvas`, (4) open the Dialog with the screenshot pre-attached. A 3-second timeout ensures the UI never stalls if `html2canvas` hangs — on timeout, the dialog opens without a screenshot. `html2canvas` is dynamically imported (`const html2canvas = (await import('html2canvas')).default`) to avoid adding ~50KB to the main bundle. The result is shown as a preview thumbnail that the user can remove if unwanted.

**Cross-origin note:** `html2canvas` cannot render cross-origin content (Google Maps, external images). The auto-capture is best-effort; manual upload is the reliable fallback. A small info note below the preview says "Auto-screenshot may be incomplete. Upload additional screenshots if needed."

**PII warning:** A visible warning below screenshots reads: "Please review screenshots for sensitive customer data before submitting."

**Manual upload:** A dropzone below the auto-capture allows drag/drop, paste, or file picker for additional screenshots. Max 3 images total (auto + manual combined). Max 5MB per image.

## Image Upload Flow

1. Client sends images as `multipart/form-data` blobs to the NestJS endpoint
2. NestJS uploads each image to the **media** `StorageProvider` (not document provider — needs public URLs) under unguessable path `bug-reports/{uuidv4}/{uuidv4}.png`
3. Media StorageProvider returns a public URL via `getPublicUrl()`
4. Public URLs are embedded in the GitHub issue body as `![Screenshot](url)`

**Storage access:** `BugReportsModule` imports `TripsModule` to access `StorageService` (which already exports the media provider). This avoids extracting a new `StorageModule` for a single use case.

## GitHub Issue Template

```markdown
## {Type} Report

**Type:** Bug | Feature | Question
**Page:** {current URL}
**Reporter:** {user name} ({user email})
**Browser:** {user agent string}
**Timestamp:** {ISO timestamp}

### Description

{user-provided description}

### Screenshots

![Auto-captured screenshot]({storage-url-1})
![User upload]({storage-url-2})

### Console Logs

```
[ERROR] 14:23:01 - TypeError: Cannot read property 'id' of undefined
[WARN] 14:23:00 - Something went wrong
```

---
*Reported via Tailfire Bug Reporter*
```

## GitHub Label Mapping

| Type | GitHub Label |
|------|-------------|
| Bug | `bug` |
| Feature | `enhancement` |
| Question | `question` |

Labels must exist in the repo before use. The service calls `octokit.issues.getLabel()` first and creates missing labels via `octokit.issues.createLabel()` as a one-time idempotent operation before creating the issue.

## New Files

### API (apps/api)

| File | Purpose |
|------|---------|
| `src/bug-reports/bug-reports.module.ts` | NestJS module |
| `src/bug-reports/bug-reports.controller.ts` | POST endpoint |
| `src/bug-reports/bug-reports.service.ts` | GitHub issue creation logic |
| `src/bug-reports/dto/create-bug-report.dto.ts` | Validation DTO |

### Admin (apps/admin)

| File | Purpose |
|------|---------|
| `src/components/bug-report/bug-report-dialog.tsx` | Modal dialog component |
| `src/components/bug-report/screenshot-capture.tsx` | html2canvas + dropzone |
| `src/providers/console-capture-provider.tsx` | Console intercept context |
| `src/hooks/use-bug-report.ts` | React Query mutation hook |

### Modified Files

| File | Change |
|------|--------|
| `apps/admin/src/components/layout/top-nav.tsx` | Add "Report a Bug" to help dropdown |
| `apps/admin/src/app/providers.tsx` | Wrap with `ConsoleCaptureProvider` |
| `apps/api/src/app.module.ts` | Register `BugReportsModule` |

## Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `html2canvas` | apps/admin | Client-side screenshot capture |
| `@octokit/rest` | apps/api | GitHub API client |

## Environment Variables

| Variable | Description | Doppler Configs |
|----------|-------------|-----------------|
| `GITHUB_TOKEN` | Fine-grained PAT with `issues:write` + `metadata:read` on `Systemsaholic/tailfire` (NO `contents:write` or `admin`) | dev, stg, prd |
| `GITHUB_REPO_OWNER` | `Systemsaholic` | dev, stg, prd |
| `GITHUB_REPO_NAME` | `tailfire` | dev, stg, prd |

## Error Handling

- If screenshot capture fails (html2canvas can fail on cross-origin content), silently skip it and let the user upload manually
- If GitHub API fails, return error to client with toast notification; do not lose the user's description (keep modal open)
- If storage upload fails, fall back to including a note in the issue body that screenshots were unavailable
- Rate limit: max 10 bug reports per user per hour — uses `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 10, ttl: 3600000 } })` on the controller (ThrottlerGuard is NOT global in this app — must be explicitly applied per-controller, same pattern as `auth.controller.ts`)

## Security

- GitHub token is server-side only (NestJS), never exposed to the client
- File upload validation: enforced at two layers — (1) multer `fileFilter` + `limits` in `FilesInterceptor` options (same pattern as `ocr-import.controller.ts`), (2) re-validated in service layer before upload. Only image MIME types (image/png, image/jpeg, image/webp), max 5MB each
- Input sanitization: **server-side** truncation + redaction of title (max 200 chars), description (max 5000 chars), and console logs (max 50 entries, 500 chars each). Client-side filtering is defense-in-depth only — the server is the trust boundary
- Auth required: endpoint requires valid Supabase JWT (same as all other API endpoints)
- Console log sanitization: lines matching sensitive patterns (`Bearer`, `token=`, `password`, `secret`, `apikey`, `authorization`) are stripped before embedding in GitHub issue
- Page URL: query parameters are included (they may contain IDs useful for debugging) but the PII risk is low since URLs only contain UUIDs in this app
- PII warning: users see a visible warning to review screenshots for sensitive customer data

## Validation

- **Backend:** `class-validator` decorators on `CreateBugReportDto` (consistent with all other DTOs)
- **Frontend:** `zod` schema + `react-hook-form` (consistent with all other admin forms)
- **Frontend API call:** uses existing `api.postFormData()` from `apps/admin/src/lib/api.ts`

## Reporter Identity

The reporter is derived **entirely server-side** from the JWT auth context via `@GetAuthContext()`. The `AuthContext` provides `userId` and `email`. The user's display name is resolved on the backend by querying the user profile (or using the email as fallback). **No reporter fields are sent from the client** — this prevents spoofing.

## Frontend API Path

The admin `api.ts` helper already prefixes `/api/v1`. The `use-bug-report.ts` hook calls `api.postFormData('/bug-reports', formData)` — NOT `/api/v1/bug-reports`.
