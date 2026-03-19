'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { X, Upload, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

interface ScreenshotCaptureProps {
  autoScreenshot: Blob | null
  screenshots: File[]
  onScreenshotsChange: (files: File[]) => void
  onRemoveAutoScreenshot: () => void
  maxFiles?: number
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Stable object URL for auto-screenshot to avoid re-creating on every render
  const autoScreenshotUrl = useMemo(
    () => (autoScreenshot ? URL.createObjectURL(autoScreenshot) : null),
    [autoScreenshot],
  )

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
      {autoScreenshot && autoScreenshotUrl && (
        <div className="relative inline-block">
          <button
            type="button"
            className="group relative block cursor-pointer overflow-hidden rounded border border-ash-200"
            onClick={() => setPreviewUrl(autoScreenshotUrl)}
          >
            <img
              src={autoScreenshotUrl}
              alt="Auto-captured screenshot"
              className="h-24 object-cover transition-opacity group-hover:opacity-80"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-ash-900 text-white hover:bg-red-600"
            onClick={onRemoveAutoScreenshot}
          >
            <X className="h-3 w-3" />
          </Button>
          <span className="mt-0.5 block text-xs text-ash-500">Auto-captured — click to preview</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {screenshots.map((file, i) => {
          const url = URL.createObjectURL(file)
          return (
            <div key={i} className="relative inline-block">
              <button
                type="button"
                className="group relative block cursor-pointer overflow-hidden rounded border border-ash-200"
                onClick={() => setPreviewUrl(url)}
              >
                <img
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="h-24 object-cover transition-opacity group-hover:opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                </div>
              </button>
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
          )
        })}
      </div>

      {/* Full-size preview lightbox */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null) }}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-auto p-2">
          <DialogTitle className="sr-only">Screenshot Preview</DialogTitle>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Screenshot preview"
              className="h-auto w-full rounded"
            />
          )}
        </DialogContent>
      </Dialog>

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
