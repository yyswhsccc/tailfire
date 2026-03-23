'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadReportExport } from '@/hooks/use-reporting'
import type { ReportQueryParams } from '@tailfire/shared-types/api'

interface ReportExportButtonsProps {
  slug: string
  params: ReportQueryParams
  disabled?: boolean
}

export function ReportExportButtons({ slug, params, disabled }: ReportExportButtonsProps) {
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null)

  async function handleExport(format: 'csv' | 'pdf') {
    setExportingFormat(format)
    try {
      await downloadReportExport(slug, params, format)
    } catch (err) {
      console.error(`Export ${format} failed:`, err)
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || exportingFormat !== null}
        onClick={() => handleExport('csv')}
      >
        {exportingFormat === 'csv' ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-2 h-3.5 w-3.5" />
        )}
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || exportingFormat !== null}
        onClick={() => handleExport('pdf')}
      >
        {exportingFormat === 'pdf' ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-2 h-3.5 w-3.5" />
        )}
        Export PDF
      </Button>
    </div>
  )
}
