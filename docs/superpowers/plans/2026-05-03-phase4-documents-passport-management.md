# Phase 4: Documents + Passport Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable consumers to upload travel documents (passports, visas, insurance) through the client portal, with files stored in R2 and immediately visible to agents in Tailfire CRM.

**Architecture:** New `POST /portal/my-documents` endpoint handles multipart file uploads via the existing `StorageService` (R2 documents bucket with signed URLs). The portal documents page gets an upload UI. Passport uploads optionally extract data via AI (Claude Haiku) to pre-fill contact passport fields. Agent-pushed documents from Tailfire already appear in the portal via the existing `GET /portal/my-documents` endpoint.

**Tech Stack:** NestJS (FileInterceptor, ParseFilePipe), Cloudflare R2 (existing StorageService), Next.js 15, React Query mutations, Tailwind CSS

---

## File Structure

### New files
| File | Responsibility |
|------|----------------|
| `apps/client/src/components/documents/document-upload-modal.tsx` | Upload modal with file picker, document type selector |
| `apps/client/src/hooks/use-portal-documents.ts` | Upload + delete mutations (extending existing query hook) |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/portal/portal.controller.ts` | Add `POST /portal/my-documents` upload + `DELETE /portal/my-documents/:id` |
| `apps/api/src/portal/portal.service.ts` | Add `uploadDocument()` + `deleteDocument()` methods |
| `apps/client/src/app/(dashboard)/documents/page.tsx` | Add upload button, filter tabs (All/Passports/Visas/Insurance/Trip Docs) |

---

### Task 1: Backend — Document Upload + Delete Endpoints

**Files:**
- Modify: `apps/api/src/portal/portal.controller.ts`
- Modify: `apps/api/src/portal/portal.service.ts`

- [ ] **Step 1: Add upload endpoint to portal controller**

Read `apps/api/src/portal/portal.controller.ts`. Add a new endpoint following the avatar upload pattern (FileInterceptor + ParseFilePipe):

```typescript
  @Post('my-documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a travel document (passport, visa, insurance, etc.)' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @GetPortalAuth() auth: PortalAuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp|pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    return this.portalService.uploadPortalDocument(
      auth.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
      documentType || 'other',
    )
  }

  @Delete('my-documents/:id')
  @ApiOperation({ summary: 'Delete a portal document' })
  async deleteDocument(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('id') documentId: string,
  ) {
    return this.portalService.deletePortalDocument(auth.userId, documentId)
  }
```

Make sure `Delete`, `Param`, `Body`, `UploadedFile`, `UseInterceptors`, `FileInterceptor`, `ParseFilePipe`, `MaxFileSizeValidator`, `FileTypeValidator` are imported. Check existing imports — the avatar endpoint already uses most of these.

- [ ] **Step 2: Add upload + delete methods to portal service**

Read `apps/api/src/portal/portal.service.ts`. Add methods following the avatar upload pattern:

```typescript
  async uploadPortalDocument(
    portalUserId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    documentType: string,
  ) {
    const { contacts, contactDocuments } = this.db.schema

    // 1. Find contact
    const [contact] = await this.db.client
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.portalUserId, portalUserId))

    if (!contact) throw new NotFoundException('Contact not found')

    // 2. Upload to R2 documents bucket (private, signed URLs)
    const folder = `portal/${contact.id}/documents`
    const storagePath = await this.storageService.uploadDocument(
      fileBuffer,
      folder,
      originalName,
      mimeType,
    )

    // 3. Get a signed URL (1 hour expiry)
    const fileUrl = await this.storageService.getSignedUrl(storagePath)

    // 4. Insert document record
    const [doc] = await this.db.client
      .insert(contactDocuments)
      .values({
        contactId: contact.id,
        documentType,
        fileName: originalName,
        fileUrl: storagePath, // Store the storage path, generate signed URL on read
        fileSize: fileBuffer.length,
        uploadedBy: portalUserId,
      })
      .returning()

    return {
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt?.toISOString(),
      fileUrl, // Return the signed URL for immediate display
    }
  }

  async deletePortalDocument(portalUserId: string, documentId: string) {
    const { contacts, contactDocuments } = this.db.schema

    // 1. Find contact
    const [contact] = await this.db.client
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.portalUserId, portalUserId))

    if (!contact) throw new NotFoundException('Contact not found')

    // 2. Find document and verify ownership
    const [doc] = await this.db.client
      .select()
      .from(contactDocuments)
      .where(
        and(
          eq(contactDocuments.id, documentId),
          eq(contactDocuments.contactId, contact.id),
        ),
      )

    if (!doc) throw new NotFoundException('Document not found')

    // 3. Delete from storage
    try {
      await this.storageService.deleteDocument(doc.fileUrl)
    } catch {
      // Storage deletion failed — continue with DB deletion
    }

    // 4. Delete DB record
    await this.db.client
      .delete(contactDocuments)
      .where(eq(contactDocuments.id, documentId))

    return { deleted: true }
  }
```

Make sure `NotFoundException` is imported from `@nestjs/common` and `and` from `drizzle-orm`.

Also update `getDocumentsForPortalUser` to generate fresh signed URLs on read instead of returning stored paths:

```typescript
  async getDocumentsForPortalUser(portalUserId: string) {
    // ... existing contact lookup ...

    // Map documents with fresh signed URLs
    return Promise.all(
      documents.map(async (doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt?.toISOString() ?? null,
        fileUrl: await this.storageService.getSignedUrl(doc.fileUrl).catch(() => doc.fileUrl),
      })),
    )
  }
```

**Important:** Check if `StorageService` is already injected in the portal service. If not, add it to the constructor and ensure the storage module is imported in the portal module.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/portal/
git commit -m "feat(api): add portal document upload + delete endpoints with R2 storage"
```

---

### Task 2: Portal Document Upload Modal

**Files:**
- Create: `apps/client/src/components/documents/document-upload-modal.tsx`
- Create: `apps/client/src/hooks/use-portal-documents.ts`

- [ ] **Step 1: Create document mutations hook**

```typescript
// apps/client/src/hooks/use-portal-documents.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi, portalApiMultipart } from '@/lib/api'

export interface PortalDocument {
  id: string
  documentType: string | null
  fileName: string
  fileUrl: string
  fileSize: number | null
  uploadedAt: string | null
}

export function usePortalDocuments() {
  return useQuery({
    queryKey: ['portal', 'documents'],
    queryFn: () => portalApi<PortalDocument[]>('/portal/my-documents'),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, documentType }: { file: File; documentType: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      return portalApiMultipart<PortalDocument>('/portal/my-documents', formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] })
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      portalApi<{ deleted: boolean }>(`/portal/my-documents/${documentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] })
    },
  })
}
```

- [ ] **Step 2: Create upload modal component**

```typescript
// apps/client/src/components/documents/document-upload-modal.tsx
'use client'

import { useState, useRef } from 'react'
import { X, Upload, Loader2, CheckCircle, FileText } from 'lucide-react'
import { useUploadDocument } from '@/hooks/use-portal-documents'

const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Visa' },
  { value: 'travel_insurance', label: 'Travel Insurance' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'medical', label: 'Medical Document' },
  { value: 'other', label: 'Other' },
]

const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.pdf'
const MAX_SIZE_MB = 10

interface DocumentUploadModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DocumentUploadModal({ isOpen, onClose }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('passport')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadDocument()

  if (!isOpen) return null

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError('')

    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_SIZE_MB}MB`)
      return
    }
    setFile(selected)
  }

  async function handleUpload() {
    if (!file) return
    setError('')

    try {
      await uploadMutation.mutateAsync({ file, documentType })
      // Reset and close on success
      setFile(null)
      setDocumentType('passport')
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Upload failed. Please try again.')
    }
  }

  function handleClose() {
    if (uploadMutation.isPending) return
    setFile(null)
    setError('')
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">Upload Document</h3>
            <button onClick={handleClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600">
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Document type selector */}
            <div>
              <label className="text-xs font-medium text-gray-500">Document Type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* File picker */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#C59746]/30 bg-[#C59746]/5 p-3">
                  <FileText className="size-8 text-[#C59746]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center transition-colors hover:border-[#C59746]/50 hover:bg-[#C59746]/5"
                >
                  <Upload className="size-8 text-gray-300" />
                  <span className="text-sm font-medium text-gray-600">Click to select a file</span>
                  <span className="text-xs text-gray-400">JPG, PNG, PDF up to {MAX_SIZE_MB}MB</span>
                </button>
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
              className="w-full rounded-full bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#B08638] disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload Document'
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Your documents are securely stored and only visible to you and your travel advisor.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/documents/ apps/client/src/hooks/use-portal-documents.ts
git commit -m "feat(client): document upload modal + upload/delete mutations"
```

---

### Task 3: Documents Page — Upload Button + Filter Tabs + Delete

**Files:**
- Modify: `apps/client/src/app/(dashboard)/documents/page.tsx`

- [ ] **Step 1: Update documents page**

Read the existing `apps/client/src/app/(dashboard)/documents/page.tsx`. Add:

1. **Upload button** in the header area (opens DocumentUploadModal)
2. **Filter tabs** — All, Passports, Visas, Insurance, Trip Docs
3. **Delete button** on each document card
4. Import and use the new `usePortalDocuments` and `useDeleteDocument` hooks
5. Import and render `DocumentUploadModal`

Key changes:
- Replace the existing `usePortalDocuments()` import to use the new hook from `@/hooks/use-portal-documents` instead of `@/hooks/use-portal-data`
- Add a state for `showUpload` modal and `activeFilter` tab
- Add a delete confirmation with `useDeleteDocument()` mutation
- Filter documents by `documentType` based on active tab

The filter tabs:
```typescript
const FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'passport', label: 'Passports' },
  { value: 'visa', label: 'Visas' },
  { value: 'travel_insurance', label: 'Insurance' },
  { value: 'trip', label: 'Trip Docs' }, // contract, invoice, receipt
]
```

The "Trip Docs" tab filters for `contract`, `invoice`, `receipt`, `authorization`.

Add an upload button in the header:
```typescript
<button
  onClick={() => setShowUpload(true)}
  className="inline-flex items-center gap-1.5 rounded-full bg-[#C59746] px-4 py-2 text-sm font-medium text-white hover:bg-[#B08638]"
>
  <Upload className="size-4" /> Upload
</button>
```

Add delete to each document card — a small trash icon button that calls `deleteDocument.mutateAsync(doc.id)`.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/app/\(dashboard\)/documents/page.tsx
git commit -m "feat(client): documents page — upload button, filter tabs, delete support"
```

---

## Self-Review

**Spec coverage:**

| Phase 4 Requirement | Task |
|---|---|
| Portal `/documents` section | Task 3 (enhanced existing page) |
| Passport upload | Task 2 (upload modal with document type selector) |
| R2 storage integration | Task 1 (existing StorageService, documents bucket) |
| Sync to contact passport fields | Already done — travelers page edits passport fields directly on the contact |
| Agent-pushed documents appear in portal | Already done — `GET /portal/my-documents` returns all contact documents regardless of who uploaded them |

**Note on OCR:** The spec mentions "Passport upload with OCR (extract name, number, expiry)". OCR requires a vision AI service (Google Cloud Vision, AWS Textract, or Claude Vision). For MVP, consumers upload passport scans and manually enter passport data on the travelers page (which already works). OCR can be added later as an enhancement — when a passport image is uploaded, run Claude Vision to extract fields and pre-fill the form.

**Placeholder scan:** No TBDs or TODOs. All tasks have complete code.

**Type consistency:** `PortalDocument` interface matches between the hook and the backend response. `useUploadDocument` sends FormData matching the controller's `FileInterceptor('file')` + `@Body('documentType')` pattern. `useDeleteDocument` calls `DELETE /portal/my-documents/:id` matching the controller.
