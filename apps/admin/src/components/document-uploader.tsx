'use client'

import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Upload,
  File,
  FileText,
  Image as ImageIcon,
  Trash2,
  Download,
  X,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react'
import { FilePreviewModal, PreviewFile } from '@/components/file-preview-modal'
import { confirmDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'

// Default API URL
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

/**
 * Get authorization headers with the current session token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

/**
 * Build and validate API endpoint URL
 *
 * @param baseUrl - Base API URL (e.g., 'http://localhost:3101/api/v1')
 * @param endpointPath - Path pattern with {id} placeholder (e.g., '/components/{id}/documents')
 * @param resourceId - Resource ID to substitute for {id}
 * @returns Fully constructed endpoint URL
 * @throws Error if resourceId is falsy or placeholder is missing
 */
function buildEndpoint(baseUrl: string, endpointPath: string, resourceId: string): string {
  // Validate resourceId
  if (!resourceId || resourceId.trim() === '') {
    throw new Error('DocumentUploader: resourceId is required and cannot be empty')
  }

  // Validate placeholder exists in path
  if (!endpointPath.includes('{id}')) {
    throw new Error(
      `DocumentUploader: endpointPath must contain {id} placeholder. Got: "${endpointPath}"`
    )
  }

  // Normalize URLs to prevent double slashes
  const normalizedBase = baseUrl.replace(/\/+$/, '') // Remove trailing slashes
  const normalizedPath = endpointPath.replace(/^\/+/, '') // Remove leading slashes

  // Replace placeholder with resourceId
  const finalPath = normalizedPath.replace('{id}', resourceId)

  return `${normalizedBase}/${finalPath}`
}

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

// Default document types for component documents
const DEFAULT_DOCUMENT_TYPES = [
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'itinerary', label: 'Itinerary' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'contract', label: 'Contract' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
] as const

// Document type option interface for custom types
export interface DocumentTypeOption {
  value: string
  label: string
}

// Document response type - handles both component and booking document formats
interface ComponentDocument {
  id: string
  componentId?: string
  bookingId?: string
  documentType: string | null
  fileUrl: string // Storage path (not for direct use)
  downloadUrl?: string | null // Signed URL for download (component docs format)
  signedUrl?: string | null // Signed URL for download (booking docs format)
  fileName?: string // component docs format
  name?: string // booking docs format
  fileSize?: number | null // component docs format
  fileSizeBytes?: number | null // booking docs format
  uploadedAt?: string
  createdAt?: string // booking docs format
  uploadedBy?: string | null
}

interface DocumentUploaderProps {
  /** Resource ID (e.g., componentId, contactId). Required and cannot be empty. */
  resourceId: string
  /** Base API URL (defaults to NEXT_PUBLIC_API_URL) */
  baseUrl?: string
  /** API endpoint path pattern. Must contain {id} placeholder (e.g., '/components/{id}/documents') */
  endpointPath?: string
  /**
   * Query key for React Query caching.
   * Should include resourceId to prevent cache collisions between instances.
   * Example: ['component-documents', resourceId] or ['contact-documents', resourceId]
   */
  queryKey?: string[]
  /**
   * Custom document types for the selector.
   * IMPORTANT: Values must match server-side enum or you'll get 400 errors.
   * Default server values: confirmation, voucher, invoice, itinerary, receipt, contract, ticket, passport, visa, other
   */
  documentTypes?: DocumentTypeOption[]
  /** Default document type selection */
  defaultDocumentType?: string
  /** Label for the document type selector */
  documentTypeLabel?: string
  /** Array of document types to exclude from the list (e.g., ['cabin_image', 'media_image']) */
  excludeTypes?: string[]
}

// Legacy props for backward compatibility
interface LegacyDocumentUploaderProps {
  componentId: string
  componentType?: string
}

// Format file size
function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Get icon for file type
function getFileIcon(fileName: string | undefined | null) {
  if (!fileName) return <File className="h-4 w-4" />
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return <ImageIcon className="h-4 w-4" />
  }
  if (ext === 'pdf') {
    return <FileText className="h-4 w-4" />
  }
  return <File className="h-4 w-4" />
}

// Helper to normalize document field names (handles both component and booking document formats)
function normalizeDoc(doc: ComponentDocument) {
  return {
    ...doc,
    // Use component format as primary, fallback to booking format
    fileName: doc.fileName || doc.name || 'Unknown',
    downloadUrl: doc.downloadUrl || doc.signedUrl || null,
    fileSize: doc.fileSize ?? doc.fileSizeBytes ?? null,
  }
}

export function DocumentUploader(props: DocumentUploaderProps | LegacyDocumentUploaderProps) {
  // Handle both new and legacy props
  const resourceId = 'resourceId' in props ? props.resourceId : props.componentId
  const baseUrl = 'baseUrl' in props ? props.baseUrl || DEFAULT_API_URL : DEFAULT_API_URL
  const endpointPath = 'endpointPath' in props
    ? props.endpointPath || '/components/{id}/documents'
    : '/components/{id}/documents'

  // Ensure queryKey always includes resourceId to prevent cache collisions
  const queryKeyBase = 'queryKey' in props && props.queryKey
    ? props.queryKey
    : ['component-documents', resourceId]

  const documentTypes = 'documentTypes' in props
    ? props.documentTypes || DEFAULT_DOCUMENT_TYPES
    : DEFAULT_DOCUMENT_TYPES
  const defaultDocType = 'defaultDocumentType' in props
    ? props.defaultDocumentType || 'other'
    : 'other'
  const docTypeLabel = 'documentTypeLabel' in props
    ? props.documentTypeLabel || 'Document Type'
    : 'Document Type'
  const excludeTypes = 'excludeTypes' in props
    ? props.excludeTypes || []
    : []

  // Build and validate endpoint URL (throws if resourceId is empty or placeholder missing)
  const apiEndpoint = buildEndpoint(baseUrl, endpointPath, resourceId)

  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedType, setSelectedType] = useState<string>(defaultDocType)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)

  // Fetch documents
  // Signed URLs expire after 1 hour, so we use a shorter staleTime to ensure fresh URLs
  const {
    data: documents,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: queryKeyBase,
    queryFn: async () => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(apiEndpoint, {
        headers: authHeaders,
      })
      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to fetch documents')
      }
      const data = await response.json()
      return data.documents as ComponentDocument[]
    },
    // Refetch before signed URLs expire (30 min staleTime for 1 hour URLs)
    staleTime: 30 * 60 * 1000,
    // Refetch on window focus to get fresh URLs
    refetchOnWindowFocus: true,
  })

  // Download with retry-on-403 for expired signed URLs
  const handleDownload = useCallback(async (doc: ComponentDocument) => {
    const url = doc.downloadUrl || doc.signedUrl
    if (!url) return

    try {
      // Try to fetch the URL to check if it's valid
      const response = await fetch(url, { method: 'HEAD' })

      if (response.status === 403 || response.status === 401) {
        // URL expired, refetch documents to get fresh signed URLs
        await refetch()
        setUploadError('Download link expired. Please try again.')
        return
      }

      // URL is valid, open it
      window.open(url, '_blank')
    } catch {
      // Network error or CORS - just try to open (might work for cross-origin)
      window.open(url, '_blank')
    }
  }, [refetch])

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', selectedType)

      const authHeaders = await getAuthHeaders()
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
        headers: authHeaders,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }))
        throw new ApiError(response.status, error.message)
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase, exact: true })
      setUploadError(null)
    },
    onError: (error: Error) => {
      setUploadError(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(
        `${apiEndpoint}/${documentId}`,
        { method: 'DELETE', headers: authHeaders }
      )

      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to delete document')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase, exact: true })
    },
  })

  // Validate file before upload
  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 10MB.`
    }

    // Check file type by extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return `File "${file.name}" has an invalid type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `File "${file.name}" has an invalid MIME type.`
    }

    return null
  }, [])

  // Handle file selection
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return

      // Validate and upload each file
      const errors: string[] = []
      const validFiles: File[] = []

      Array.from(files).forEach((file) => {
        const error = validateFile(file)
        if (error) {
          errors.push(error)
        } else {
          validFiles.push(file)
        }
      })

      // Show validation errors
      if (errors.length > 0) {
        setUploadError(errors.join('\n'))
      }

      // Upload valid files
      validFiles.forEach((file) => {
        uploadMutation.mutate(file)
      })

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [uploadMutation, validateFile]
  )

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  // Click to upload
  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* Document type selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-ash-700">{docTypeLabel}:</label>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {documentTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Upload zone */}
      <div
        className={`
          relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer
          transition-colors duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-ash-300 hover:border-ash-400'
          }
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <Upload className="mx-auto h-8 w-8 text-ash-400" />
        <p className="mt-2 text-sm text-ash-600">
          {isDragging ? (
            'Drop files here...'
          ) : (
            <>
              <span className="font-medium text-blue-600">Click to upload</span> or drag and
              drop
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-ash-500">
          PDF, DOC, XLS, JPG, PNG up to 10MB
        </p>

        {uploadMutation.isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}
      </div>

      {/* Error message */}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Documents list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-ash-400" />
        </div>
      ) : fetchError ? (
        <div className="text-sm text-red-600">Failed to load documents</div>
      ) : documents && documents.length > 0 ? (
        (() => {
          // Filter out excluded document types
          const filteredDocuments = documents.filter(doc =>
            !doc.documentType || !excludeTypes.includes(doc.documentType)
          )

          return filteredDocuments.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-ash-700">
                Uploaded Documents ({filteredDocuments.length})
              </h4>
              <div className="divide-y divide-ash-100 rounded-lg border border-ash-200">
                {filteredDocuments.map((rawDoc) => {
                  const doc = normalizeDoc(rawDoc)
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 hover:bg-ash-50"
                    >
                      <div className="flex-shrink-0 text-ash-400">
                        {getFileIcon(doc.fileName)}
                      </div>
                      <div className="flex-grow min-w-0">
                        <button
                          onClick={() => setPreviewFile({
                            fileName: doc.fileName,
                            downloadUrl: doc.downloadUrl,
                            fileSize: doc.fileSize,
                            documentType: doc.documentType,
                          })}
                          className="text-sm font-medium text-ash-900 truncate hover:text-blue-600 hover:underline text-left block w-full"
                          title="Click to preview"
                        >
                          {doc.fileName}
                        </button>
                        <p className="text-xs text-ash-500">
                          {doc.documentType && (
                            <span className="capitalize">{doc.documentType}</span>
                          )}
                          {doc.documentType && doc.fileSize && ' • '}
                          {formatFileSize(doc.fileSize)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewFile({
                            fileName: doc.fileName,
                            downloadUrl: doc.downloadUrl,
                            fileSize: doc.fileSize,
                            documentType: doc.documentType,
                          })}
                          disabled={!doc.downloadUrl}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(rawDoc)}
                          disabled={!doc.downloadUrl}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const confirmed = await confirmDialog({
                              title: 'Delete Document',
                              description: `Are you sure you want to delete "${doc.fileName}"? This action cannot be undone.`,
                              confirmLabel: 'Delete',
                              variant: 'destructive',
                            })
                            if (confirmed) {
                              deleteMutation.mutate(doc.id)
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          title="Delete"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-red-500" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ash-500 text-center py-2">
              No documents uploaded yet
            </p>
          )
        })()
      ) : (
        <p className="text-sm text-ash-500 text-center py-2">
          No documents uploaded yet
        </p>
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={previewFile !== null}
        onClose={() => setPreviewFile(null)}
        onDownload={(file) => {
          // Find the original doc to use handleDownload (check both URL formats)
          const doc = documents?.find(d =>
            (d.downloadUrl && d.downloadUrl === file.downloadUrl) ||
            (d.signedUrl && d.signedUrl === file.downloadUrl)
          )
          if (doc) {
            handleDownload(doc)
          } else if (file.downloadUrl) {
            window.open(file.downloadUrl, '_blank')
          }
        }}
      />
    </div>
  )
}
