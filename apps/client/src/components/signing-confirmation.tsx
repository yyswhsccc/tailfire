'use client'

import { Check, Download } from 'lucide-react'
import { Button, Separator } from '@tailfire/ui-public'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SigningConfirmationProps {
  agencyName: string
  documentTitle: string
  referenceNumber: string
  signedAt: string
  recipientEmail?: string | null
  pdfBase64?: string | null
  /** Filename used when downloading the PDF (without extension). */
  pdfFilename?: string
  /** Optional message shown below the title. */
  message?: string
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatSignedAt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function SigningConfirmation({
  agencyName,
  documentTitle,
  referenceNumber,
  signedAt,
  recipientEmail,
  pdfBase64,
  pdfFilename,
  message,
}: SigningConfirmationProps) {
  const handleDownloadPdf = () => {
    if (!pdfBase64) return
    const byteCharacters = atob(pdfBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pdfFilename ?? `signed-document-${referenceNumber}`}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[700px] bg-white shadow-sm border border-gray-200 rounded-lg">
        <div className="p-8 md:p-12 text-center">

          {/* Agency name */}
          <p className="text-sm font-medium tracking-widest uppercase text-[#c59746] mb-6">
            {agencyName}
          </p>

          {/* Success icon */}
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>

          {/* Title */}
          <h1
            className="text-2xl font-bold text-gray-900 mb-2"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {documentTitle}
          </h1>

          {message && (
            <p className="text-sm text-gray-500 mt-2">{message}</p>
          )}

          {/* Reference + timestamp */}
          <div className="mt-6 space-y-2 text-sm text-gray-600">
            <p>
              <span className="text-gray-400">Reference:</span>{' '}
              <span className="font-mono font-medium text-gray-900">{referenceNumber}</span>
            </p>
            <p>
              <span className="text-gray-400">Signed:</span>{' '}
              {formatSignedAt(signedAt)}
            </p>
          </div>

          {/* PDF / email delivery block */}
          {pdfBase64 && (
            <>
              <Separator className="my-6" />

              <div className="text-sm text-gray-600 space-y-1 mb-6">
                <p>A copy of this signed document has been:</p>
                {recipientEmail && (
                  <p>
                    Emailed to{' '}
                    <span className="font-medium text-gray-900">{recipientEmail}</span>
                  </p>
                )}
                <p>Added to your trip documents</p>
              </div>

              <Button
                onClick={handleDownloadPdf}
                className="bg-[#c59746] hover:bg-[#b08636] text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF Copy
              </Button>
            </>
          )}

          <p className="mt-8 text-xs text-gray-400">You may close this page.</p>
        </div>
      </div>
    </div>
  )
}
