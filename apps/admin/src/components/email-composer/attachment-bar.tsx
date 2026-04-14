'use client'

import { useRef } from 'react'
import { Upload, X, File } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Paperclip } from 'lucide-react'
import { api } from '@/lib/api'

export interface AttachmentFile {
  filename: string
  storagePath: string
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

export function AttachmentBar({ attachments, onChange, tripId: _tripId, accountId }: AttachmentBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const currentTotal = attachments.reduce((sum, a) => sum + (a.size || 0), 0)
      if (currentTotal + file.size > 10 * 1024 * 1024) {
        alert('Total attachment size cannot exceed 10 MB')
        break
      }

      const formData = new FormData()
      formData.append('file', file)

      try {
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

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index))
  }

  const totalSize = attachments.reduce((sum, a) => sum + (a.size || 0), 0)

  return (
    <>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

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

// Export a trigger button that the toolbar can use
export function AttachmentTrigger({ onClick }: { onClick: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Paperclip className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={onClick}>
          <Upload className="mr-2 h-4 w-4" />
          Upload from computer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
