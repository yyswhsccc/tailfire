# Bug Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app bug reporter that creates GitHub issues with auto-captured screenshots, console logs, and user context.

**Architecture:** Client captures screenshot + console logs, user fills form, POST multipart to NestJS endpoint which uploads images to existing media storage and creates a GitHub issue via Octokit. Reporter identity derived server-side from JWT.

**Tech Stack:** Next.js (admin), NestJS (API), shadcn/ui Dialog, html2canvas, @octokit/rest, react-hook-form + zod, class-validator, existing StorageService

**Spec:** `docs/superpowers/specs/2026-03-19-bug-reporter-design.md`

---

## File Structure

### New Files - API (`apps/api/src/bug-reports/`)

| File | Responsibility |
|------|---------------|
| `bug-reports.module.ts` | NestJS module, imports TripsModule + ConfigModule |
| `bug-reports.controller.ts` | POST endpoint with file upload, throttling, auth |
| `bug-reports.service.ts` | Octokit client, image upload, GitHub issue creation |
| `dto/create-bug-report.dto.ts` | class-validator DTO for request body |

### New Files - Admin (`apps/admin/src/`)

| File | Responsibility |
|------|---------------|
| `providers/console-capture-provider.tsx` | Context provider that patches console.error/warn |
| `components/bug-report/bug-report-dialog.tsx` | Modal dialog with form |
| `components/bug-report/screenshot-capture.tsx` | Auto-capture + manual upload dropzone |
| `hooks/use-bug-report.ts` | React Query mutation hook |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Add `BugReportsModule` to imports |
| `apps/admin/src/app/providers.tsx` | Wrap with `ConsoleCaptureProvider` |
| `apps/admin/src/components/layout/top-nav.tsx` | Add "Report a Bug" to help dropdown |

---

## Task 1: Console Capture Provider

**Files:**
- Create: `apps/admin/src/providers/console-capture-provider.tsx`

- [ ] **Step 1: Create the ConsoleCapture context provider**

```tsx
'use client'

import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react'

export interface ConsoleLogEntry {
  level: 'error' | 'warn'
  timestamp: string
  message: string
}

interface ConsoleCaptureContextValue {
  getConsoleLogs: () => ConsoleLogEntry[]
  clearConsoleLogs: () => void
}

const ConsoleCaptureContext = createContext<ConsoleCaptureContextValue | null>(null)

const MAX_ENTRIES = 50
const MAX_MESSAGE_LENGTH = 500

function stringifyArgs(args: unknown[]): string {
  const parts = args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`
    }
    if (typeof arg === 'string') return arg
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  })
  const message = parts.join(' ')
  return message.length > MAX_MESSAGE_LENGTH
    ? message.slice(0, MAX_MESSAGE_LENGTH) + '...'
    : message
}

export function ConsoleCaptureProvider({ children }: { children: ReactNode }) {
  const bufferRef = useRef<ConsoleLogEntry[]>([])
  const patchedRef = useRef(false)
  const originalErrorRef = useRef<typeof console.error | null>(null)
  const originalWarnRef = useRef<typeof console.warn | null>(null)

  useEffect(() => {
    // Idempotent for React Strict Mode — only patch once
    if (patchedRef.current) return

    patchedRef.current = true
    originalErrorRef.current = console.error
    originalWarnRef.current = console.warn

    const addEntry = (level: 'error' | 'warn', args: unknown[]) => {
      const entry: ConsoleLogEntry = {
        level,
        timestamp: new Date().toISOString(),
        message: stringifyArgs(args),
      }
      bufferRef.current.push(entry)
      if (bufferRef.current.length > MAX_ENTRIES) {
        bufferRef.current.shift()
      }
    }

    console.error = (...args: unknown[]) => {
      addEntry('error', args)
      originalErrorRef.current?.apply(console, args)
    }

    console.warn = (...args: unknown[]) => {
      addEntry('warn', args)
      originalWarnRef.current?.apply(console, args)
    }

    return () => {
      if (originalErrorRef.current) console.error = originalErrorRef.current
      if (originalWarnRef.current) console.warn = originalWarnRef.current
      patchedRef.current = false
    }
  }, [])

  const getConsoleLogs = useCallback(() => [...bufferRef.current], [])
  const clearConsoleLogs = useCallback(() => { bufferRef.current = [] }, [])

  return (
    <ConsoleCaptureContext.Provider value={{ getConsoleLogs, clearConsoleLogs }}>
      {children}
    </ConsoleCaptureContext.Provider>
  )
}

export function useConsoleCapture() {
  const ctx = useContext(ConsoleCaptureContext)
  if (!ctx) {
    throw new Error('useConsoleCapture must be used within ConsoleCaptureProvider')
  }
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/providers/console-capture-provider.tsx
git commit -m "feat(admin): add ConsoleCaptureProvider for bug reporter"
```

---

## Task 2: Wire ConsoleCaptureProvider into Providers

**Files:**
- Modify: `apps/admin/src/app/providers.tsx`

- [ ] **Step 1: Add import and wrap inside QueryClientProvider, outside AuthProvider**

Add import at top:
```tsx
import { ConsoleCaptureProvider } from '@/providers/console-capture-provider'
```

Change the provider nesting in the return statement from:
```tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>
```
to:
```tsx
<QueryClientProvider client={queryClient}>
  <ConsoleCaptureProvider>
    <AuthProvider>
```

And add the closing tag before `</QueryClientProvider>`:
```tsx
    </AuthProvider>
  </ConsoleCaptureProvider>
</QueryClientProvider>
```

- [ ] **Step 2: Verify dev server still loads without errors**

Run: Check browser console at `http://localhost:3100` — no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/providers.tsx
git commit -m "feat(admin): wire ConsoleCaptureProvider into providers"
```

---

## Task 3: API DTO + Module + Controller + Service

**Files:**
- Create: `apps/api/src/bug-reports/dto/create-bug-report.dto.ts`
- Create: `apps/api/src/bug-reports/bug-reports.service.ts`
- Create: `apps/api/src/bug-reports/bug-reports.controller.ts`
- Create: `apps/api/src/bug-reports/bug-reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

```typescript
// apps/api/src/bug-reports/dto/create-bug-report.dto.ts
import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator'

export enum BugReportType {
  BUG = 'bug',
  FEATURE = 'feature',
  QUESTION = 'question',
}

export class CreateBugReportDto {
  @IsString()
  @MaxLength(200)
  title: string

  @IsString()
  @MaxLength(5000)
  description: string

  @IsEnum(BugReportType)
  type: BugReportType

  @IsString()
  @MaxLength(2000)
  pageUrl: string

  @IsString()
  @MaxLength(500)
  userAgent: string

  @IsOptional()
  @IsString()
  @MaxLength(30000) // 50 entries * 500 chars + JSON overhead
  consoleLogs?: string // JSON-stringified ConsoleLogEntry[]
}
```

- [ ] **Step 2: Create the service**

```typescript
// apps/api/src/bug-reports/bug-reports.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Octokit } from '@octokit/rest'
import { randomUUID } from 'crypto'
import { StorageService } from '../trips/storage.service'
import type { AuthContext } from '../auth/auth.types'
import { BugReportType } from './dto/create-bug-report.dto'

interface ConsoleLogEntry {
  level: 'error' | 'warn'
  timestamp: string
  message: string
}

const SENSITIVE_PATTERNS = /bearer|token=|password|secret|apikey|authorization/i

const LABEL_MAP: Record<BugReportType, { name: string; color: string }> = {
  [BugReportType.BUG]: { name: 'bug', color: 'd73a4a' },
  [BugReportType.FEATURE]: { name: 'enhancement', color: 'a2eeef' },
  [BugReportType.QUESTION]: { name: 'question', color: 'd876e3' },
}

const PREFIX_MAP: Record<BugReportType, string> = {
  [BugReportType.BUG]: '[Bug]',
  [BugReportType.FEATURE]: '[Feature]',
  [BugReportType.QUESTION]: '[Question]',
}

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name)
  private readonly octokit: Octokit
  private readonly repoOwner: string
  private readonly repoName: string

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    const token = this.configService.get<string>('GITHUB_TOKEN')
    this.repoOwner = this.configService.get<string>('GITHUB_REPO_OWNER', 'Systemsaholic')
    this.repoName = this.configService.get<string>('GITHUB_REPO_NAME', 'tailfire')

    this.octokit = new Octokit({ auth: token })
  }

  async createBugReport(
    dto: {
      title: string
      description: string
      type: BugReportType
      pageUrl: string
      userAgent: string
      consoleLogs?: string
    },
    files: Express.Multer.File[],
    auth: AuthContext,
  ): Promise<{ issueUrl: string; issueNumber: number }> {
    // 1. Upload screenshots
    const screenshotUrls = await this.uploadScreenshots(files)

    // 2. Sanitize console logs
    const sanitizedLogs = this.sanitizeConsoleLogs(dto.consoleLogs)

    // 3. Ensure label exists
    const label = LABEL_MAP[dto.type]
    await this.ensureLabelExists(label.name, label.color)

    // 4. Build issue body
    const body = this.buildIssueBody({
      type: dto.type,
      description: dto.description,
      pageUrl: dto.pageUrl,
      userAgent: dto.userAgent,
      reporterEmail: auth.email,
      reporterUserId: auth.userId,
      screenshotUrls,
      consoleLogs: sanitizedLogs,
    })

    // 5. Create GitHub issue
    const prefix = PREFIX_MAP[dto.type]
    const sanitizedTitle = dto.title.slice(0, 200)

    const { data: issue } = await this.octokit.issues.create({
      owner: this.repoOwner,
      repo: this.repoName,
      title: `${prefix} ${sanitizedTitle}`,
      body,
      labels: [label.name],
    })

    this.logger.log(
      `Bug report created: #${issue.number} by ${auth.email} — ${issue.html_url}`,
    )

    return { issueUrl: issue.html_url, issueNumber: issue.number }
  }

  private async uploadScreenshots(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    if (!files?.length) return []

    const urls: string[] = []
    for (const file of files) {
      try {
        // Re-validate on service layer
        if (file.size > 5 * 1024 * 1024) continue
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) continue

        const folder = `bug-reports/${randomUUID()}`
        const { url } = await this.storageService.uploadMediaFile(
          file.buffer,
          folder,
          `${randomUUID()}.${file.mimetype.split('/')[1]}`,
          file.mimetype,
        )
        urls.push(url)
      } catch (err) {
        this.logger.warn(`Failed to upload screenshot: ${err}`)
      }
    }
    return urls
  }

  private sanitizeConsoleLogs(rawLogs?: string): string {
    if (!rawLogs) return ''

    let entries: ConsoleLogEntry[]
    try {
      entries = JSON.parse(rawLogs)
      if (!Array.isArray(entries)) return ''
    } catch {
      return ''
    }

    // Limit to 50 entries, filter sensitive data
    return entries
      .slice(-50)
      .filter((e) => !SENSITIVE_PATTERNS.test(e.message))
      .map((e) => {
        const tag = e.level === 'error' ? 'ERROR' : 'WARN'
        const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '??:??:??'
        const msg = e.message.slice(0, 500)
        return `[${tag}] ${time} - ${msg}`
      })
      .join('\n')
  }

  private buildIssueBody(params: {
    type: BugReportType
    description: string
    pageUrl: string
    userAgent: string
    reporterEmail: string
    reporterUserId: string
    screenshotUrls: string[]
    consoleLogs: string
  }): string {
    const typeLabel =
      params.type === BugReportType.BUG ? 'Bug' :
      params.type === BugReportType.FEATURE ? 'Feature Request' : 'Question'

    const screenshotSection = params.screenshotUrls.length
      ? params.screenshotUrls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join('\n')
      : '_No screenshots attached_'

    const consoleSection = params.consoleLogs
      ? '```\n' + params.consoleLogs + '\n```'
      : '_No console logs captured_'

    return `## ${typeLabel} Report

**Type:** ${typeLabel}
**Page:** ${params.pageUrl}
**Reporter:** ${params.reporterEmail} (ID: ${params.reporterUserId})
**Browser:** ${params.userAgent}
**Timestamp:** ${new Date().toISOString()}

### Description

${params.description.slice(0, 5000)}

### Screenshots

${screenshotSection}

### Console Logs

${consoleSection}

---
_Reported via Tailfire Bug Reporter_`
  }

  private async ensureLabelExists(name: string, color: string): Promise<void> {
    try {
      await this.octokit.issues.getLabel({
        owner: this.repoOwner,
        repo: this.repoName,
        name,
      })
    } catch {
      try {
        await this.octokit.issues.createLabel({
          owner: this.repoOwner,
          repo: this.repoName,
          name,
          color,
        })
      } catch (err) {
        this.logger.warn(`Failed to create label "${name}": ${err}`)
      }
    }
  }
}
```

- [ ] **Step 3: Create the controller**

```typescript
// apps/api/src/bug-reports/bug-reports.controller.ts
import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { BugReportsService } from './bug-reports.service'
import { CreateBugReportDto } from './dto/create-bug-report.dto'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly bugReportsService: BugReportsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @UseInterceptors(
    FilesInterceptor('screenshots', 3, {
      limits: { fileSize: MAX_FILE_SIZE, files: 3 },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WebP`,
            ),
            false,
          )
        } else {
          callback(null, true)
        }
      },
    }),
  )
  async create(
    @Body() dto: CreateBugReportDto,
    @UploadedFiles() files: Express.Multer.File[],
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.bugReportsService.createBugReport(dto, files || [], auth)
  }
}
```

- [ ] **Step 4: Create the module**

```typescript
// apps/api/src/bug-reports/bug-reports.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TripsModule } from '../trips/trips.module'
import { BugReportsController } from './bug-reports.controller'
import { BugReportsService } from './bug-reports.service'

@Module({
  imports: [ConfigModule, TripsModule],
  controllers: [BugReportsController],
  providers: [BugReportsService],
})
export class BugReportsModule {}
```

- [ ] **Step 5: Register in app.module.ts**

Add import at top of `apps/api/src/app.module.ts`:
```typescript
import { BugReportsModule } from './bug-reports/bug-reports.module'
```

Add `BugReportsModule` to the `imports` array, before `EnrichmentModule`:
```typescript
    BugReportsModule,
    // Activity enrichment (geocoding, cruise catalog, hotel photos)
    EnrichmentModule,
```

- [ ] **Step 6: Install @octokit/rest in apps/api**

```bash
cd apps/api && pnpm add @octokit/rest
```

- [ ] **Step 7: Verify API compiles**

```bash
cd apps/api && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bug-reports/ apps/api/src/app.module.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add bug-reports module with GitHub issue creation"
```

---

## Task 4: Screenshot Capture Component

**Files:**
- Create: `apps/admin/src/components/bug-report/screenshot-capture.tsx`

- [ ] **Step 1: Create the screenshot capture + upload component**

```tsx
'use client'

import { useState, useCallback, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ScreenshotCaptureProps {
  autoScreenshot: Blob | null
  screenshots: File[]
  onScreenshotsChange: (files: File[]) => void
  onRemoveAutoScreenshot: () => void
  maxFiles?: number
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function ScreenshotCapture({
  autoScreenshot,
  screenshots,
  onScreenshotsChange,
  onRemoveAutoScreenshot,
  maxFiles = 3,
}: ScreenshotCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const totalCount = (autoScreenshot ? 1 : 0) + screenshots.length
  const canAddMore = totalCount < maxFiles

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const validFiles = Array.from(newFiles).filter((f) => {
        if (!ACCEPTED_TYPES.includes(f.type)) return false
        if (f.size > MAX_FILE_SIZE) return false
        return true
      })
      const remaining = maxFiles - (autoScreenshot ? 1 : 0) - screenshots.length
      const toAdd = validFiles.slice(0, remaining)
      if (toAdd.length > 0) {
        onScreenshotsChange([...screenshots, ...toAdd])
      }
    },
    [autoScreenshot, screenshots, maxFiles, onScreenshotsChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && ACCEPTED_TYPES.includes(item.type)) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length) addFiles(files)
    },
    [addFiles],
  )

  const removeManualScreenshot = (index: number) => {
    onScreenshotsChange(screenshots.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2" onPaste={handlePaste}>
      {/* Auto-captured screenshot preview */}
      {autoScreenshot && (
        <div className="relative inline-block">
          <img
            src={URL.createObjectURL(autoScreenshot)}
            alt="Auto-captured screenshot"
            className="h-24 rounded border border-ash-200 object-cover"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-ash-900 text-white hover:bg-red-600"
            onClick={onRemoveAutoScreenshot}
          >
            <X className="h-3 w-3" />
          </Button>
          <span className="mt-0.5 block text-xs text-ash-500">Auto-captured</span>
        </div>
      )}

      {/* Manual screenshots */}
      <div className="flex flex-wrap gap-2">
        {screenshots.map((file, i) => (
          <div key={i} className="relative inline-block">
            <img
              src={URL.createObjectURL(file)}
              alt={`Screenshot ${i + 1}`}
              className="h-24 rounded border border-ash-200 object-cover"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-ash-900 text-white hover:bg-red-600"
              onClick={() => removeManualScreenshot(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Dropzone */}
      {canAddMore && (
        <div
          className={`flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors ${
            dragOver ? 'border-phoenix-gold-600 bg-phoenix-gold-50' : 'border-ash-300 hover:border-ash-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex items-center gap-2 text-sm text-ash-500">
            <Upload className="h-4 w-4" />
            <span>Drop, paste, or click to add screenshots</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      <p className="text-xs text-amber-600">
        Please review screenshots for sensitive customer data before submitting.
      </p>
      <p className="text-xs text-ash-400">
        Auto-screenshot may be incomplete. Upload additional screenshots if needed. Max {maxFiles} images, 5MB each.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/bug-report/screenshot-capture.tsx
git commit -m "feat(admin): add ScreenshotCapture component for bug reporter"
```

---

## Task 5: Bug Report Mutation Hook

**Files:**
- Create: `apps/admin/src/hooks/use-bug-report.ts`

- [ ] **Step 1: Create the mutation hook**

```tsx
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type BugReportType = 'bug' | 'feature' | 'question'

interface BugReportPayload {
  title: string
  description: string
  type: BugReportType
  pageUrl: string
  userAgent: string
  consoleLogs?: string
  autoScreenshot?: Blob | null
  manualScreenshots?: File[]
}

interface BugReportResponse {
  issueUrl: string
  issueNumber: number
}

export function useBugReport() {
  return useMutation({
    mutationFn: async (payload: BugReportPayload): Promise<BugReportResponse> => {
      const formData = new FormData()
      formData.append('title', payload.title)
      formData.append('description', payload.description)
      formData.append('type', payload.type)
      formData.append('pageUrl', payload.pageUrl)
      formData.append('userAgent', payload.userAgent)
      if (payload.consoleLogs) {
        formData.append('consoleLogs', payload.consoleLogs)
      }

      // Append auto-captured screenshot
      if (payload.autoScreenshot) {
        formData.append('screenshots', payload.autoScreenshot, 'auto-screenshot.png')
      }

      // Append manual screenshots
      if (payload.manualScreenshots) {
        for (const file of payload.manualScreenshots) {
          formData.append('screenshots', file, file.name)
        }
      }

      return api.postFormData<BugReportResponse>('/bug-reports', formData)
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-bug-report.ts
git commit -m "feat(admin): add useBugReport mutation hook"
```

---

## Task 6: Bug Report Dialog

**Files:**
- Create: `apps/admin/src/components/bug-report/bug-report-dialog.tsx`

- [ ] **Step 1: Install html2canvas**

```bash
cd apps/admin && pnpm add html2canvas
```

- [ ] **Step 2: Create the dialog component**

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { ScreenshotCapture } from './screenshot-capture'
import { useConsoleCapture } from '@/providers/console-capture-provider'
import { useBugReport, type BugReportType } from '@/hooks/use-bug-report'

const bugReportSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  type: z.enum(['bug', 'feature', 'question']),
})

type BugReportFormValues = z.infer<typeof bugReportSchema>

interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  autoScreenshot: Blob | null
}

export function BugReportDialog({
  open,
  onOpenChange,
  autoScreenshot: initialAutoScreenshot,
}: BugReportDialogProps) {
  const { getConsoleLogs } = useConsoleCapture()
  const { toast } = useToast()
  const bugReportMutation = useBugReport()

  const [autoScreenshot, setAutoScreenshot] = useState<Blob | null>(initialAutoScreenshot)
  const [manualScreenshots, setManualScreenshots] = useState<File[]>([])
  const [consoleLogs] = useState(() => getConsoleLogs())
  const [logsOpen, setLogsOpen] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BugReportFormValues>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: { title: '', description: '', type: 'bug' },
  })

  const selectedType = watch('type')

  const onSubmit = async (values: BugReportFormValues) => {
    try {
      const result = await bugReportMutation.mutateAsync({
        ...values,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        consoleLogs: consoleLogs.length ? JSON.stringify(consoleLogs) : undefined,
        autoScreenshot,
        manualScreenshots,
      })

      toast({
        title: 'Bug report submitted!',
        description: `Issue #${result.issueNumber} created — ${result.issueUrl}`,
      })

      reset()
      setAutoScreenshot(null)
      setManualScreenshots([])
      onOpenChange(false)
    } catch {
      toast({
        title: 'Failed to submit bug report',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Submit a bug report, feature request, or question. This creates a GitHub issue for the team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={selectedType}
              onValueChange={(v) => setValue('type', v as BugReportType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">Title</Label>
            <Input
              id="bug-title"
              placeholder="Brief summary of the issue"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="bug-description">Description</Label>
            <Textarea
              id="bug-description"
              placeholder="Steps to reproduce, expected vs actual behavior..."
              rows={4}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Page URL (read-only) */}
          <div className="space-y-1.5">
            <Label>Page URL</Label>
            <Input value={typeof window !== 'undefined' ? window.location.href : ''} readOnly className="bg-ash-50 text-ash-500" />
          </div>

          {/* Screenshots */}
          <div className="space-y-1.5">
            <Label>Screenshots</Label>
            <ScreenshotCapture
              autoScreenshot={autoScreenshot}
              screenshots={manualScreenshots}
              onScreenshotsChange={setManualScreenshots}
              onRemoveAutoScreenshot={() => setAutoScreenshot(null)}
            />
          </div>

          {/* Console Logs */}
          {consoleLogs.length > 0 && (
            <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-ash-600">
                  <ChevronDown className={`h-4 w-4 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                  Console Logs ({consoleLogs.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-ash-50 p-2 text-xs text-ash-700">
                  {consoleLogs.map((log, i) => (
                    <div key={i} className={log.level === 'error' ? 'text-red-600' : 'text-amber-600'}>
                      [{log.level.toUpperCase()}] {new Date(log.timestamp).toLocaleTimeString()} - {log.message}
                    </div>
                  ))}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={bugReportMutation.isPending}>
              {bugReportMutation.isPending ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/bug-report/bug-report-dialog.tsx apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(admin): add BugReportDialog component"
```

---

## Task 7: Wire into Top Nav Help Dropdown

**Files:**
- Modify: `apps/admin/src/components/layout/top-nav.tsx`

- [ ] **Step 1: Add imports at top of file**

Add `useState` to the React import (if not already present), then add:
```tsx
import { useState } from 'react'
import { Bug } from 'lucide-react'
import { BugReportDialog } from '@/components/bug-report/bug-report-dialog'
```

- [ ] **Step 2: Add state inside the component (near other state declarations)**

```tsx
const [bugReportOpen, setBugReportOpen] = useState(false)
const [autoScreenshot, setAutoScreenshot] = useState<Blob | null>(null)
```

- [ ] **Step 3: Add the screenshot capture handler function inside the component**

```tsx
const handleReportBug = async () => {
  // Close the dropdown first, wait for it to unmount
  // The dropdown menu closes automatically when an item is clicked

  try {
    // Wait one frame for dropdown overlay to unmount
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

    // Capture screenshot with timeout
    const html2canvas = (await import('html2canvas')).default
    const capturePromise = html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
    })

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3000)
    )

    const canvas = await Promise.race([capturePromise, timeoutPromise])
    if (canvas) {
      const blob = await new Promise<Blob | null>((resolve) =>
        (canvas as HTMLCanvasElement).toBlob(resolve, 'image/png')
      )
      setAutoScreenshot(blob)
    }
  } catch {
    // Screenshot capture failed — open dialog without it
  }

  setBugReportOpen(true)
}
```

- [ ] **Step 4: Replace the help dropdown items section**

Find the existing help dropdown items:
```tsx
<DropdownMenuItem>Documentation</DropdownMenuItem>
<DropdownMenuItem>Support</DropdownMenuItem>
<DropdownMenuItem>Keyboard Shortcuts</DropdownMenuItem>
```

Replace with:
```tsx
<DropdownMenuItem>Documentation</DropdownMenuItem>
<DropdownMenuItem>Support</DropdownMenuItem>
<DropdownMenuItem>Keyboard Shortcuts</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem onClick={handleReportBug}>
  <Bug className="mr-2 h-4 w-4" />
  Report a Bug
</DropdownMenuItem>
```

- [ ] **Step 5: Add the BugReportDialog render, just before the closing fragment or parent div**

```tsx
<BugReportDialog
  open={bugReportOpen}
  onOpenChange={(open) => {
    setBugReportOpen(open)
    if (!open) setAutoScreenshot(null)
  }}
  autoScreenshot={autoScreenshot}
/>
```

- [ ] **Step 6: Verify in browser**

1. Navigate to `http://localhost:3100`
2. Click the (?) help icon
3. Confirm "Report a Bug" appears at the bottom with a bug icon
4. Click it — dialog should open (auto-screenshot may or may not work depending on page content)
5. Fill out form and verify it doesn't error (actual submission requires GITHUB_TOKEN)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/layout/top-nav.tsx
git commit -m "feat(admin): add Report a Bug to help dropdown with screenshot capture"
```

---

## Task 8: Environment Variables + Final Verification

- [ ] **Step 1: Add GITHUB_TOKEN to Doppler dev config**

The user must create a GitHub fine-grained PAT at https://github.com/settings/tokens?type=beta with:
- Repository: `Systemsaholic/tailfire`
- Permissions: Issues (Read and write), Metadata (Read)

Then add to Doppler:
```
GITHUB_TOKEN=ghp_xxxxx
GITHUB_REPO_OWNER=Systemsaholic
GITHUB_REPO_NAME=tailfire
```

Add to all three configs: `dev`, `stg`, `prd`.

- [ ] **Step 2: Pull env vars locally**

```bash
cd apps/api && doppler secrets download --config dev --no-file --format env-no-quotes > .env
```

Or add to `.env` manually for local testing.

- [ ] **Step 3: End-to-end test**

1. Restart dev server: `turbo dev`
2. Navigate to any page in admin
3. Click (?) > Report a Bug
4. Fill in title, description, select "Bug"
5. Submit
6. Verify: GitHub issue created at https://github.com/Systemsaholic/tailfire/issues
7. Verify: screenshots uploaded and visible in issue body
8. Verify: console logs appear in code block
9. Verify: reporter email matches logged-in user

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete bug reporter — GitHub issue creation with screenshots and console logs"
```
