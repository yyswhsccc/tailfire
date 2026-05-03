'use client'

import { useState, useRef } from 'react'
import { X, Upload, Loader2, FileText } from 'lucide-react'
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
