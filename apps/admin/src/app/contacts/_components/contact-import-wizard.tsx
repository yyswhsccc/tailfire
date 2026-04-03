'use client'

import { useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ImportColumnMapper } from './import-column-mapper'
import { ImportPreviewTable } from './import-preview-table'
import { parseFile } from '@/lib/import/parse-contacts'
import { detectColumnMapping } from '@/lib/import/column-detection'
import { normalizeRow } from '@/lib/import/normalize-contacts'
import { useContactImportPreview, useContactImportConfirm } from '@/hooks/use-contact-import'
import type {
  ContactImportRow,
  ContactImportPreviewResult,
  ContactImportConfirmRow,
  ContactImportConfirmResult,
} from '@tailfire/shared-types/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 'upload' | 'mapping' | 'preview' | 'results'

interface ContactImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEP_TITLES: Record<WizardStep, string> = {
  upload: 'Import Contacts — Upload',
  mapping: 'Import Contacts — Map Columns',
  preview: 'Import Contacts — Preview',
  results: 'Import Contacts — Results',
}

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactImportWizard({ open, onOpenChange }: ContactImportWizardProps) {
  // Step state
  const [step, setStep] = useState<WizardStep>('upload')

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [tags, setTags] = useState<string[]>([])

  // Preview state
  const [normalizedRows, setNormalizedRows] = useState<ContactImportRow[]>([])
  const [previewResults, setPreviewResults] = useState<ContactImportPreviewResult | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [rowActions, setRowActions] = useState<Map<number, 'create' | 'merge' | 'skip'>>(new Map())

  // Results state
  const [confirmResults, setConfirmResults] = useState<ContactImportConfirmResult | null>(null)

  // Mutations
  const importPreview = useContactImportPreview()
  const importConfirm = useContactImportConfirm()

  // ---------------------------------------------------------------------------
  // Reset wizard to initial state
  // ---------------------------------------------------------------------------

  const resetWizard = useCallback(() => {
    setStep('upload')
    setFileName(null)
    setHeaders([])
    setRawRows([])
    setParseError(null)
    setIsParsing(false)
    setMapping({})
    setTags([])
    setNormalizedRows([])
    setPreviewResults(null)
    setSelectedRows(new Set())
    setRowActions(new Map())
    setConfirmResults(null)
    importPreview.reset()
    importConfirm.reset()
  }, [importPreview, importConfirm])

  // ---------------------------------------------------------------------------
  // Dialog open/close
  // ---------------------------------------------------------------------------

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetWizard()
    }
    onOpenChange(nextOpen)
  }

  // ---------------------------------------------------------------------------
  // Step 1: Upload
  // ---------------------------------------------------------------------------

  async function handleFileSelect(file: File) {
    setParseError(null)
    setIsParsing(true)

    try {
      const result = await parseFile(file)
      setFileName(file.name)
      setHeaders(result.headers)
      setRawRows(result.rows)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.')
    } finally {
      setIsParsing(false)
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = ''
  }

  function handleDropzoneDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  function handleDropzoneDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function goToMapping() {
    const autoMapping = detectColumnMapping(headers)
    setMapping(autoMapping)
    setTags([`Import ${format(new Date(), 'yyyy-MM-dd')}`])
    setStep('mapping')
  }

  // ---------------------------------------------------------------------------
  // Step 2: Mapping → Preview
  // ---------------------------------------------------------------------------

  async function goToPreview() {
    // Find fullName header if mapped
    const fullNameHeader = Object.entries(mapping).find(([, field]) => field === 'fullName')?.[0]

    // Normalize all rows
    const normalized = rawRows.map((row) => normalizeRow(row, mapping, fullNameHeader))
    setNormalizedRows(normalized)

    setStep('preview')

    try {
      const result = await importPreview.mutateAsync({ rows: normalized })
      setPreviewResults(result)

      // Auto-select all actionable rows
      const actionable = new Set<number>()
      for (const r of result.results) {
        if (r.disposition === 'new' || r.disposition === 'update' || r.disposition === 'possible_match') {
          actionable.add(r.rowIndex)
        }
      }
      setSelectedRows(actionable)

      // Set default actions for possible_match rows
      const actions = new Map<number, 'create' | 'merge' | 'skip'>()
      for (const r of result.results) {
        if (r.disposition === 'possible_match') {
          actions.set(r.rowIndex, 'create')
        }
      }
      setRowActions(actions)
    } catch {
      // Error is available via importPreview.error
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Preview → Confirm
  // ---------------------------------------------------------------------------

  async function handleImportConfirm() {
    if (!previewResults) return

    const resultByIndex = new Map(
      previewResults.results.map((r) => [r.rowIndex, r]),
    )

    const confirmRows: ContactImportConfirmRow[] = []

    for (const rowIndex of selectedRows) {
      const row = normalizedRows[rowIndex]
      const result = resultByIndex.get(rowIndex)
      if (!row || !result) continue

      let action: 'create' | 'merge' | 'skip'

      if (result.disposition === 'possible_match') {
        action = rowActions.get(rowIndex) ?? 'create'
      } else if (result.disposition === 'update') {
        action = 'merge'
      } else {
        action = 'create'
      }

      if (action === 'skip') continue

      confirmRows.push({
        ...row,
        action,
        mergeContactId: action === 'merge' ? result.matchedContactId : undefined,
      })
    }

    try {
      const result = await importConfirm.mutateAsync({
        rows: confirmRows,
        tags,
      })
      setConfirmResults(result)
      setStep('results')
    } catch {
      // Error is available via importConfirm.error
    }
  }

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const selectedCount = selectedRows.size
  const isPreviewLoading = importPreview.isPending
  const isConfirmLoading = importConfirm.isPending

  // ---------------------------------------------------------------------------
  // Row action change handler
  // ---------------------------------------------------------------------------

  function handleRowActionChange(rowIndex: number, action: 'create' | 'merge' | 'skip') {
    setRowActions((prev) => {
      const next = new Map(prev)
      next.set(rowIndex, action)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV or Excel file to import contacts.'}
            {step === 'mapping' && 'Map your file columns to Tailfire contact fields.'}
            {step === 'preview' && 'Review the import preview before confirming.'}
            {step === 'results' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {/* ================================================================ */}
        {/* Step 1: Upload                                                   */}
        {/* ================================================================ */}
        {step === 'upload' && (
          <div className="space-y-4 py-2">
            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDropzoneDrop}
              onDragOver={handleDropzoneDragOver}
              className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-12 cursor-pointer transition-colors hover:border-muted-foreground/40 hover:bg-muted/30"
            >
              {isParsing ? (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-10 w-10 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isParsing ? 'Parsing file...' : 'Click or drag a file to upload'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported formats: .csv, .xlsx, .xls
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {/* Parse error */}
            {parseError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* File info */}
            {fileName && !parseError && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-3">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rawRows.length} row{rawRows.length !== 1 ? 's' : ''} found, {headers.length} column{headers.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* Step 2: Mapping                                                  */}
        {/* ================================================================ */}
        {step === 'mapping' && (
          <div className="py-2">
            <ImportColumnMapper
              headers={headers}
              mapping={mapping}
              onMappingChange={setMapping}
              tags={tags}
              onTagsChange={setTags}
            />
          </div>
        )}

        {/* ================================================================ */}
        {/* Step 3: Preview                                                  */}
        {/* ================================================================ */}
        {step === 'preview' && (
          <div className="py-2 space-y-3">
            {isPreviewLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Analyzing {normalizedRows.length} contacts...
                </p>
              </div>
            )}

            {importPreview.isError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Failed to generate preview.{' '}
                  {importPreview.error instanceof Error
                    ? importPreview.error.message
                    : 'Please try again.'}
                </span>
              </div>
            )}

            {previewResults && (
              <ImportPreviewTable
                previewResults={previewResults}
                rows={normalizedRows}
                selectedRows={selectedRows}
                onSelectionChange={setSelectedRows}
                rowActions={rowActions}
                onRowActionChange={handleRowActionChange}
              />
            )}

            {importConfirm.isError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Import failed.{' '}
                  {importConfirm.error instanceof Error
                    ? importConfirm.error.message
                    : 'Please try again.'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* Step 4: Results                                                  */}
        {/* ================================================================ */}
        {step === 'results' && confirmResults && (
          <div className="py-2 space-y-4">
            {/* Summary */}
            <div className="flex items-start gap-3 rounded-md border bg-green-50 border-green-200 px-4 py-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-800">Import Complete</p>
                <div className="text-sm text-green-700 space-y-0.5">
                  <p>Created: <strong>{confirmResults.created}</strong></p>
                  <p>Updated: <strong>{confirmResults.updated}</strong></p>
                  <p>Skipped: <strong>{confirmResults.skipped}</strong></p>
                  {confirmResults.tagName && (
                    <p className="text-xs text-green-600 mt-2">
                      Tagged with: {confirmResults.tagName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Errors */}
            {confirmResults.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-700">
                  {confirmResults.errors.length} error{confirmResults.errors.length !== 1 ? 's' : ''} occurred:
                </p>
                <div className="rounded-md border border-red-200 bg-red-50 divide-y divide-red-100 max-h-48 overflow-y-auto">
                  {confirmResults.errors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-2 px-4 py-2 text-sm text-red-700">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Row {err.rowIndex + 1}: {err.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* Footer                                                           */}
        {/* ================================================================ */}
        <DialogFooter>
          {step === 'upload' && (
            <Button
              onClick={goToMapping}
              disabled={rawRows.length === 0 || isParsing}
            >
              Next
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={goToPreview}
                disabled={
                  // Must have at least firstName or lastName mapped
                  !Object.values(mapping).some(
                    (f) => f === 'firstName' || f === 'lastName' || f === 'fullName',
                  )
                }
              >
                Preview
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setPreviewResults(null)
                  importPreview.reset()
                  importConfirm.reset()
                  setStep('mapping')
                }}
                disabled={isPreviewLoading || isConfirmLoading}
              >
                Back
              </Button>
              <Button
                onClick={handleImportConfirm}
                disabled={isPreviewLoading || isConfirmLoading || selectedCount === 0}
              >
                {isConfirmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${selectedCount} Contact${selectedCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </>
          )}

          {step === 'results' && (
            <Button onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
