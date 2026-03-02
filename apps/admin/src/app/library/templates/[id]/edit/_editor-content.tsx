'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Editor from '@monaco-editor/react'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  BookOpen,
  X,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  useDocumentTemplate,
  useUpdateDocumentTemplate,
  useTemplateVariables,
  useTemplatePreview,
} from '@/hooks/use-document-templates'

// ============================================================================
// Types
// ============================================================================

interface TemplateEditorContentProps {
  templateId: string
}

type TabKey =
  | 'pdfHtml'
  | 'pdfCss'
  | 'emailHtml'
  | 'emailCss'
  | 'subjectTemplate'
  | 'textTemplate'

interface TabConfig {
  key: TabKey
  label: string
  language: string
}

// ============================================================================
// Constants
// ============================================================================

const TABS: TabConfig[] = [
  { key: 'pdfHtml', label: 'PDF HTML', language: 'html' },
  { key: 'pdfCss', label: 'PDF CSS', language: 'css' },
  { key: 'emailHtml', label: 'Email HTML', language: 'html' },
  { key: 'emailCss', label: 'Email CSS', language: 'css' },
  { key: 'subjectTemplate', label: 'Subject', language: 'handlebars' },
  { key: 'textTemplate', label: 'Text', language: 'plaintext' },
]

// ============================================================================
// Component
// ============================================================================

export default function TemplateEditorContent({
  templateId,
}: TemplateEditorContentProps) {
  const router = useRouter()
  const { toast } = useToast()

  // Data hooks
  const {
    data: template,
    isLoading,
    error,
  } = useDocumentTemplate(templateId)
  const updateMutation = useUpdateDocumentTemplate()
  const { data: variablesData } = useTemplateVariables()

  // Rendered preview from the backend (uses sample data, renders Handlebars)
  const {
    data: renderedPreview,
    refetch: refetchPreview,
    isFetching: isPreviewFetching,
  } = useTemplatePreview(template?.slug ?? null)

  // Local editor state for each field
  const [fields, setFields] = useState<Record<TabKey, string>>({
    pdfHtml: '',
    pdfCss: '',
    emailHtml: '',
    emailCss: '',
    subjectTemplate: '',
    textTemplate: '',
  })
  const [initialized, setInitialized] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('pdfHtml')
  const [isSaving, setIsSaving] = useState(false)
  const [showVariables, setShowVariables] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Track the saved snapshot to detect dirty state
  const savedFieldsRef = useRef<Record<TabKey, string>>({
    pdfHtml: '',
    pdfCss: '',
    emailHtml: '',
    emailCss: '',
    subjectTemplate: '',
    textTemplate: '',
  })

  // Initialize fields from template data
  useEffect(() => {
    if (template && !initialized) {
      const initial: Record<TabKey, string> = {
        pdfHtml: template.pdfHtml ?? '',
        pdfCss: template.pdfCss ?? '',
        emailHtml: template.emailHtml ?? '',
        emailCss: template.emailCss ?? '',
        subjectTemplate: template.subjectTemplate ?? '',
        textTemplate: template.textTemplate ?? '',
      }
      setFields(initial)
      savedFieldsRef.current = { ...initial }
      setInitialized(true)
    }
  }, [template, initialized])

  // Determine which preview to show based on active tab
  const previewMode = useMemo(() => {
    if (activeTab === 'emailHtml' || activeTab === 'emailCss') return 'email'
    return 'pdf'
  }, [activeTab])

  // Build the preview HTML from the backend-rendered response
  const previewHtml = useMemo(() => {
    if (!renderedPreview) return ''

    if (previewMode === 'email') {
      // Email preview: rendered html from backend
      return renderedPreview.html ?? ''
    }

    // PDF preview: rendered pdfHtml from backend, wrap with the CSS
    const pdfContent = renderedPreview.pdfHtml ?? ''
    // The rendered pdfHtml is already the full body content with variables resolved
    // Wrap it with the CSS for proper styling
    const css = fields.pdfCss
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
</head>
<body>${pdfContent}</body>
</html>`
  }, [renderedPreview, previewMode, fields.pdfCss])

  // Handle field changes from Monaco
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setFields((prev) => {
        const next = { ...prev, [activeTab]: value ?? '' }
        // Check if dirty
        const dirty = (Object.keys(next) as TabKey[]).some(
          (k) => next[k] !== savedFieldsRef.current[k]
        )
        setIsDirty(dirty)
        return next
      })
    },
    [activeTab]
  )

  // Save handler
  const handleSave = useCallback(async () => {
    if (!template) return

    setIsSaving(true)
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        data: {
          pdfHtml: fields.pdfHtml || undefined,
          pdfCss: fields.pdfCss || undefined,
          emailHtml: fields.emailHtml || undefined,
          emailCss: fields.emailCss || undefined,
          subjectTemplate: fields.subjectTemplate || undefined,
          textTemplate: fields.textTemplate || undefined,
        },
      })

      // Update saved snapshot and clear dirty state
      savedFieldsRef.current = { ...fields }
      setIsDirty(false)

      // Refetch the rendered preview with updated content
      refetchPreview()

      toast({
        title: 'Template saved',
        description: `"${template.name}" has been updated`,
      })
    } catch (err) {
      toast({
        title: 'Failed to save template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [template, fields, updateMutation, toast, refetchPreview])

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // Active tab config
  const activeTabConfig = TABS.find((t) => t.key === activeTab)!

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="text-sm font-medium text-ash-900">
          Error loading template
        </h3>
        <p className="text-sm text-ash-500">{error.message}</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  // No template found
  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <AlertCircle className="h-12 w-12 text-ash-400" />
        <h3 className="text-sm font-medium text-ash-900">
          Template not found
        </h3>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ash-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/library/templates')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-5 w-px bg-ash-200" />
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ash-900">
              {template.name}
            </h1>
            <Badge variant="outline" className="text-xs">
              v{template.version}
            </Badge>
            <Badge
              variant="secondary"
              className={
                template.status === 'published'
                  ? 'bg-green-100 text-green-800'
                  : template.status === 'draft'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-600'
              }
            >
              {template.status}
            </Badge>
            {!template.agencyId && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                System
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVariables((v) => !v)}
          >
            <BookOpen className="h-4 w-4 mr-1" />
            Variables
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Tabs + Editor */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-ash-200 bg-ash-50 shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-ash-500 hover:text-ash-700 hover:bg-ash-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Monaco editor */}
          <div className="flex-1 min-h-0">
            <Editor
              language={activeTabConfig.language}
              value={fields[activeTab]}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Right panel: Live Preview */}
        <div className="w-[50%] border-l border-ash-200 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-ash-200 bg-ash-50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ash-600">
                Preview ({previewMode === 'email' ? 'Email' : 'PDF'})
              </span>
              {isPreviewFetching && (
                <Loader2 className="h-3 w-3 animate-spin text-ash-400" />
              )}
            </div>
            {isDirty && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600">Unsaved changes</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Save & Refresh
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 bg-white">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
                title="Template Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-ash-400" />
              </div>
            )}
          </div>
        </div>

        {/* Variables reference sidebar (collapsible) */}
        {showVariables && (
          <div className="w-72 border-l border-ash-200 flex flex-col bg-white shrink-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-ash-200 bg-ash-50">
              <span className="text-sm font-medium text-ash-600">
                Variables Reference
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowVariables(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {variablesData ? (
                <div className="space-y-4">
                  {/* Variables grouped by category */}
                  {Object.entries(variablesData.variables).map(
                    ([category, vars]) => (
                      <div key={category}>
                        <h4 className="font-semibold text-ash-700 mb-1 capitalize">
                          {category}
                        </h4>
                        <div className="space-y-0.5">
                          {vars.map((v) => (
                            <code
                              key={v}
                              className="block text-xs bg-ash-100 px-1.5 py-0.5 rounded text-ash-800 font-mono"
                            >
                              {'{{'}
                              {v}
                              {'}}'}
                            </code>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {/* Helpers */}
                  {variablesData.helpers.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-ash-700 mb-1">
                        Helpers
                      </h4>
                      <div className="space-y-2">
                        {variablesData.helpers.map((h) => (
                          <div key={h.name}>
                            <code className="text-xs bg-ash-100 px-1.5 py-0.5 rounded text-ash-800 font-mono">
                              {h.usage}
                            </code>
                            <p className="text-xs text-ash-500 mt-0.5">
                              {h.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Block helpers */}
                  {variablesData.blockHelpers.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-ash-700 mb-1">
                        Block Helpers
                      </h4>
                      <div className="space-y-2">
                        {variablesData.blockHelpers.map((h) => (
                          <div key={h.name}>
                            <code className="text-xs bg-ash-100 px-1.5 py-0.5 rounded text-ash-800 font-mono whitespace-pre-wrap">
                              {h.usage}
                            </code>
                            <p className="text-xs text-ash-500 mt-0.5">
                              {h.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-ash-400" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
