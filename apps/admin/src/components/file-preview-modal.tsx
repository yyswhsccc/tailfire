'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Download,
  FileText,
  File,
  Loader2,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react'

export interface PreviewFile {
  fileName: string
  downloadUrl: string | null
  fileSize?: number | null
  documentType?: string | null
}

interface FilePreviewModalProps {
  file: PreviewFile | null
  isOpen: boolean
  onClose: () => void
  onDownload?: (file: PreviewFile) => void
}

// Get file extension from filename
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

// Check if file is previewable
function isPreviewable(fileName: string): boolean {
  const ext = getFileExtension(fileName)
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt'].includes(ext)
}

// Get preview type
function getPreviewType(fileName: string): 'image' | 'pdf' | 'text' | 'none' {
  const ext = getFileExtension(fileName)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'txt') return 'text'
  return 'none'
}

// Format file size
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePreviewModal({
  file,
  isOpen,
  onClose,
  onDownload,
}: FilePreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [imageZoom, setImageZoom] = useState(100)
  const [imageRotation, setImageRotation] = useState(0)

  // Reset state when file changes
  useEffect(() => {
    setIsLoading(true)
    setError(null)
    setTextContent(null)
    setImageZoom(100)
    setImageRotation(0)
  }, [file?.downloadUrl])

  // Load text content for text files
  useEffect(() => {
    if (!file?.downloadUrl || getPreviewType(file.fileName) !== 'text') return

    const loadTextContent = async () => {
      try {
        const response = await fetch(file.downloadUrl!)
        if (!response.ok) throw new Error('Failed to load file')
        const text = await response.text()
        setTextContent(text)
        setIsLoading(false)
      } catch {
        setError('Failed to load file content')
        setIsLoading(false)
      }
    }

    loadTextContent()
  }, [file?.downloadUrl, file?.fileName])

  if (!file) return null

  const previewType = getPreviewType(file.fileName)
  const canPreview = isPreviewable(file.fileName) && file.downloadUrl

  const handleDownload = () => {
    if (onDownload) {
      onDownload(file)
    } else if (file.downloadUrl) {
      window.open(file.downloadUrl, '_blank')
    }
  }

  const handleZoomIn = () => setImageZoom((prev) => Math.min(prev + 25, 200))
  const handleZoomOut = () => setImageZoom((prev) => Math.max(prev - 25, 50))
  const handleRotate = () => setImageRotation((prev) => (prev + 90) % 360)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-ash-200 flex-shrink-0">
          <DialogDescription className="sr-only">
            Preview of {file.fileName}
          </DialogDescription>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <DialogTitle className="text-base font-medium truncate">
                {file.fileName}
              </DialogTitle>
              <p className="text-xs text-ash-500 mt-0.5">
                {file.documentType && (
                  <span className="capitalize">{file.documentType}</span>
                )}
                {file.documentType && file.fileSize && ' • '}
                {formatFileSize(file.fileSize)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {previewType === 'image' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomOut}
                    disabled={imageZoom <= 50}
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-ash-500 w-12 text-center">
                    {imageZoom}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomIn}
                    disabled={imageZoom >= 200}
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRotate}
                    title="Rotate"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-4 bg-ash-200" />
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={!file.downloadUrl}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              {file.downloadUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(file.downloadUrl!, '_blank')}
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-ash-50 min-h-0">
          {canPreview ? (
            <div className="h-full flex items-center justify-center p-4">
              {/* Image Preview */}
              {previewType === 'image' && (
                <div className="relative w-full h-full flex items-center justify-center overflow-auto">
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
                    </div>
                  )}
                  <img
                    src={file.downloadUrl!}
                    alt={file.fileName}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{
                      transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
                    }}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                      setIsLoading(false)
                      setError('Failed to load image')
                    }}
                  />
                </div>
              )}

              {/* PDF Preview */}
              {previewType === 'pdf' && (
                <div className="w-full h-full min-h-[500px]">
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
                    </div>
                  )}
                  <iframe
                    src={file.downloadUrl!}
                    className="w-full h-full border-0"
                    title={file.fileName}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                      setIsLoading(false)
                      setError('Failed to load PDF')
                    }}
                  />
                </div>
              )}

              {/* Text Preview */}
              {previewType === 'text' && (
                <div className="w-full h-full overflow-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-500">
                      {error}
                    </div>
                  ) : (
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words bg-white rounded-lg border border-ash-200">
                      {textContent}
                    </pre>
                  )}
                </div>
              )}

              {/* Error State */}
              {error && previewType !== 'text' && (
                <div className="text-center text-red-500">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download instead
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* No Preview Available */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
              <div className="rounded-full bg-ash-100 p-4 mb-4">
                {getFileExtension(file.fileName) === 'pdf' ? (
                  <FileText className="h-8 w-8 text-ash-400" />
                ) : (
                  <File className="h-8 w-8 text-ash-400" />
                )}
              </div>
              <h3 className="text-lg font-medium text-ash-900 mb-1">
                Preview not available
              </h3>
              <p className="text-sm text-ash-500 mb-4">
                {file.downloadUrl
                  ? 'This file type cannot be previewed in the browser.'
                  : 'No download URL available for this file.'}
              </p>
              {file.downloadUrl && (
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
