'use client'

/**
 * Media Uploader Component
 *
 * Uploads images and videos to the public media bucket.
 * Supports drag-and-drop, thumbnails, inline caption editing,
 * and Unsplash stock photo integration.
 */

import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Upload,
  Image as ImageIcon,
  Video,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Check,
  ImagePlus,
} from 'lucide-react'
import { confirmDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UnsplashPicker } from '@/components/unsplash-picker'
import { ApiError } from '@/lib/api'

// Default API URL
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

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

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'webm']
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
]

// Unsplash photo type (from UnsplashPicker)
interface UnsplashPhoto {
  id: string
  description: string | null
  altDescription: string | null
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  user: {
    name: string
    username: string
    links: {
      html: string
    }
  }
  links: {
    html: string
    download_location: string
  }
  width: number
  height: number
}

export type MediaTab = 'upload' | 'stock'

// Generalized media response type (works for both component and trip media)
export interface GenericMedia {
  id: string
  mediaType: 'image' | 'video' | 'document'
  fileUrl: string
  fileName: string
  fileSize: number | null
  caption: string | null
  orderIndex: number
  uploadedAt: string
  isCoverPhoto?: boolean
  attribution?: {
    source: string
    photographerName: string
    photographerUrl: string
    photoUrl: string
  } | null
}

interface MediaUploaderProps {
  /** Component ID to attach media to. Use this OR custom endpoints. */
  componentId?: string
  /** Custom API endpoint for media list/upload (e.g., /trips/{id}/media) */
  apiEndpoint?: string
  /** Custom external media endpoint (e.g., /trips/{id}/media/external) */
  externalEndpoint?: string
  /** Base API URL (defaults to NEXT_PUBLIC_API_URL) */
  baseUrl?: string
  /** Optional callback when media changes */
  onMediaChange?: (media: GenericMedia[]) => void
  /** Maximum number of files allowed (optional) */
  maxFiles?: number
  /** Allowed media types (defaults to ['image', 'video']) */
  allowedTypes?: ('image' | 'video')[]
  /** Show stock photos tab (defaults to true for images-only) */
  showStockPhotos?: boolean
  /** Controlled active tab value */
  activeTab?: MediaTab
  /** Callback when tab changes (for controlled mode) */
  onTabChange?: (tab: MediaTab) => void
  /** Whether to set uploaded media as cover photo */
  setAsCover?: boolean
  /** Hide the media grid (useful when parent component manages display) */
  hideMediaGrid?: boolean
  /** Query key for cache invalidation */
  queryKey?: readonly string[]
  /** Additional query keys to invalidate on media changes (e.g., itinerary days for thumbnail updates) */
  additionalQueryKeys?: (readonly string[])[]
}

// Format file size
function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaUploader({
  componentId,
  apiEndpoint: customApiEndpoint,
  externalEndpoint: customExternalEndpoint,
  baseUrl = DEFAULT_API_URL,
  onMediaChange,
  maxFiles,
  allowedTypes = ['image', 'video'],
  showStockPhotos,
  activeTab: controlledActiveTab,
  onTabChange,
  setAsCover = false,
  hideMediaGrid = false,
  queryKey: customQueryKey,
  additionalQueryKeys = [],
}: MediaUploaderProps) {
  // Build endpoints - use custom if provided, else fall back to component-based
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const resolvedApiEndpoint = customApiEndpoint
    ? `${normalizedBase}${customApiEndpoint}`
    : `${normalizedBase}/components/${componentId}/media`
  const resolvedExternalEndpoint = customExternalEndpoint
    ? `${normalizedBase}${customExternalEndpoint}`
    : `${normalizedBase}/components/${componentId}/media/external`

  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null)
  const [captionValue, setCaptionValue] = useState('')
  const [internalTab, setInternalTab] = useState<MediaTab>('upload')

  // Determine if stock photos should be shown (default: only when images allowed but not videos)
  const shouldShowStockPhotos = showStockPhotos ?? (allowedTypes.includes('image') && !allowedTypes.includes('video'))

  // Use controlled or uncontrolled tab
  const currentTab = controlledActiveTab ?? internalTab
  const handleTabChange = useCallback((value: string) => {
    const tab = value as MediaTab
    if (onTabChange) {
      onTabChange(tab)
    } else {
      setInternalTab(tab)
    }
  }, [onTabChange])

  // Query key - use custom if provided, else generate from componentId or endpoint
  const queryKey: readonly string[] = customQueryKey ?? ['component-media', componentId ?? customApiEndpoint ?? '']

  // Fetch media
  const {
    data: media,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(resolvedApiEndpoint, {
        headers: authHeaders,
      })
      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to fetch media')
      }
      const data = await response.json()
      return data.media as GenericMedia[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (public URLs don't expire)
  })

  // Notify parent when media changes
  const notifyMediaChange = useCallback((newMedia: GenericMedia[]) => {
    if (onMediaChange) {
      onMediaChange(newMedia)
    }
  }, [onMediaChange])

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      if (setAsCover) {
        formData.append('isCoverPhoto', 'true')
      }

      const authHeaders = await getAuthHeaders()
      const response = await fetch(resolvedApiEndpoint, {
        method: 'POST',
        body: formData,
        headers: authHeaders,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }))
        throw new ApiError(response.status, error.message)
      }

      return response.json() as Promise<GenericMedia>
    },
    onSuccess: (newMedia) => {
      queryClient.invalidateQueries({ queryKey, exact: true })
      // Invalidate additional query keys (e.g., for thumbnail updates)
      additionalQueryKeys.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key })
      })
      setUploadError(null)
      // Optimistically update local state
      if (media) {
        notifyMediaChange([...media, newMedia])
      }
    },
    onError: (error: Error) => {
      setUploadError(error.message)
    },
  })

  // Update caption mutation
  const updateCaptionMutation = useMutation({
    mutationFn: async ({ mediaId, caption }: { mediaId: string; caption: string }) => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(`${resolvedApiEndpoint}/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ caption }),
      })

      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to update caption')
      }

      return response.json() as Promise<GenericMedia>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey, exact: true })
      setEditingCaptionId(null)
      setCaptionValue('')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(`${resolvedApiEndpoint}/${mediaId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })

      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to delete media')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey, exact: true })
      // Invalidate additional query keys (e.g., for thumbnail updates)
      additionalQueryKeys.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key })
      })
    },
  })

  // External media mutation (Unsplash stock photos)
  const externalMediaMutation = useMutation({
    mutationFn: async (photo: UnsplashPhoto) => {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(resolvedExternalEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          unsplashPhotoId: photo.id,
          downloadLocation: photo.links.download_location,
          caption: photo.altDescription || photo.description || null,
          isCoverPhoto: setAsCover,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to add photo' }))
        throw new ApiError(response.status, error.message)
      }

      return response.json() as Promise<GenericMedia>
    },
    onSuccess: (newMedia) => {
      queryClient.invalidateQueries({ queryKey, exact: true })
      // Invalidate additional query keys (e.g., for thumbnail updates)
      additionalQueryKeys.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key })
      })
      setUploadError(null)
      // Optimistically update local state
      if (media) {
        notifyMediaChange([...media, newMedia])
      }
      // Switch to upload tab to show new media
      handleTabChange('upload')
    },
    onError: (error: Error) => {
      setUploadError(error.message)
    },
  })

  // Handle Unsplash photo selection
  const handleUnsplashSelect = useCallback((photo: UnsplashPhoto) => {
    // Check max files limit
    if (maxFiles && media && media.length >= maxFiles) {
      setUploadError(`Maximum ${maxFiles} files allowed. You have ${media.length} already.`)
      return
    }
    externalMediaMutation.mutate(photo)
  }, [externalMediaMutation, maxFiles, media])

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

    // Check allowed types
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (isImage && !allowedTypes.includes('image')) {
      return 'Images are not allowed for this upload.'
    }
    if (isVideo && !allowedTypes.includes('video')) {
      return 'Videos are not allowed for this upload.'
    }

    return null
  }, [allowedTypes])

  // Handle file selection
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return

      // Check max files limit
      if (maxFiles && media && media.length + files.length > maxFiles) {
        setUploadError(`Maximum ${maxFiles} files allowed. You have ${media.length} already.`)
        return
      }

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
    [uploadMutation, validateFile, maxFiles, media]
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

  // Start editing caption
  const startEditCaption = (item: GenericMedia) => {
    setEditingCaptionId(item.id)
    setCaptionValue(item.caption || '')
  }

  // Save caption
  const saveCaption = (mediaId: string) => {
    updateCaptionMutation.mutate({ mediaId, caption: captionValue })
  }

  // Cancel caption edit
  const cancelCaptionEdit = () => {
    setEditingCaptionId(null)
    setCaptionValue('')
  }

  // Build accept attribute
  const acceptTypes = allowedTypes
    .flatMap(type => type === 'image'
      ? ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']
      : ['.mp4', '.webm']
    )
    .join(',')

  const isAtMaxFiles = maxFiles && media && media.length >= maxFiles

  // Upload zone component (reused in tabs)
  const uploadZone = !isAtMaxFiles && (
    <div
      className={`
        relative rounded-lg border-2 border-dashed p-6 text-center cursor-pointer
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
        accept={acceptTypes}
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
        {allowedTypes.includes('image') && allowedTypes.includes('video')
          ? 'JPG, PNG, GIF, WebP, AVIF, MP4, WebM up to 10MB'
          : allowedTypes.includes('image')
            ? 'JPG, PNG, GIF, WebP, AVIF up to 10MB'
            : 'MP4, WebM up to 10MB'}
      </p>

      {uploadMutation.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Tabs for Upload / Stock Photos */}
      {shouldShowStockPhotos ? (
        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <ImagePlus className="h-4 w-4" />
              Stock Photos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            {uploadZone}
          </TabsContent>
          <TabsContent value="stock" className="mt-4">
            <UnsplashPicker
              onSelect={handleUnsplashSelect}
              isSelecting={externalMediaMutation.isPending}
            />
          </TabsContent>
        </Tabs>
      ) : (
        uploadZone
      )}

      {/* Error message */}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="whitespace-pre-line">{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Media grid - only show if not hidden */}
      {!hideMediaGrid && (isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ash-400" />
        </div>
      ) : fetchError ? (
        <div className="text-sm text-red-600">Failed to load media</div>
      ) : media && media.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {media.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-lg border border-ash-200 overflow-hidden bg-ash-50"
            >
              {/* Thumbnail */}
              <div className="aspect-square relative">
                {item.mediaType === 'image' ? (
                  <img
                    src={item.fileUrl}
                    alt={item.caption || item.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : item.mediaType === 'video' ? (
                  <div className="w-full h-full flex items-center justify-center bg-ash-100">
                    <Video className="h-12 w-12 text-ash-400" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-ash-100">
                    <ImageIcon className="h-12 w-12 text-ash-400" />
                  </div>
                )}

                {/* Delete button overlay */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const confirmed = await confirmDialog({
                      title: 'Delete Media',
                      description: `Are you sure you want to delete this ${item.mediaType}? This action cannot be undone.`,
                      confirmLabel: 'Delete',
                      variant: 'destructive',
                    })
                    if (confirmed) {
                      deleteMutation.mutate(item.id)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>

              {/* Caption */}
              <div className="p-2">
                {editingCaptionId === item.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={captionValue}
                      onChange={(e) => setCaptionValue(e.target.value)}
                      placeholder="Add caption..."
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveCaption(item.id)
                        } else if (e.key === 'Escape') {
                          cancelCaptionEdit()
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => saveCaption(item.id)}
                      disabled={updateCaptionMutation.isPending}
                    >
                      {updateCaptionMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={cancelCaptionEdit}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1 cursor-pointer group/caption"
                    onClick={() => startEditCaption(item)}
                  >
                    {item.caption ? (
                      <span className="text-xs text-ash-700 truncate flex-1">
                        {item.caption}
                      </span>
                    ) : (
                      <span className="text-xs text-ash-400 italic flex-1">
                        Add caption...
                      </span>
                    )}
                    <Pencil className="h-3 w-3 text-ash-400 opacity-0 group-hover/caption:opacity-100 transition-opacity" />
                  </div>
                )}
                {item.fileSize && (
                  <p className="text-xs text-ash-400 mt-0.5">
                    {formatFileSize(item.fileSize)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ash-500 text-center py-4">
          No media uploaded yet
        </p>
      ))}

      {/* File count */}
      {!hideMediaGrid && maxFiles && media && (
        <p className="text-xs text-ash-500 text-center">
          {media.length} / {maxFiles} files
        </p>
      )}
    </div>
  )
}
