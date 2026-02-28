'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react'
import grapesjs, { type Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  useDocumentTemplate,
  useUpdateDocumentTemplate,
} from '@/hooks/use-document-templates'

// ============================================================================
// Props
// ============================================================================

interface TemplateEditorContentProps {
  templateId: string
}

// ============================================================================
// Component
// ============================================================================

export default function TemplateEditorContent({ templateId }: TemplateEditorContentProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  // Load template data
  const { data: template, isLoading, error } = useDocumentTemplate(templateId)
  const updateMutation = useUpdateDocumentTemplate()

  // Initialize GrapesJS editor
  useEffect(() => {
    if (!containerRef.current || !template || editorRef.current) return

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: 'auto',
      storageManager: false,
      plugins: [],
      blockManager: {
        blocks: [
          {
            id: 'text',
            label: 'Text',
            content: '<div data-gjs-type="text">Insert text here</div>',
            category: 'Content',
          },
          {
            id: 'heading',
            label: 'Heading',
            content: '<h2 data-gjs-type="text">Heading</h2>',
            category: 'Content',
          },
          {
            id: 'image',
            label: 'Image',
            content: { type: 'image' },
            category: 'Media',
          },
          {
            id: 'divider',
            label: 'Divider',
            content: '<hr/>',
            category: 'Layout',
          },
          {
            id: 'section',
            label: 'Section',
            content: '<section class="template-section" style="padding: 16px;"><div data-gjs-type="text">Section content</div></section>',
            category: 'Layout',
          },
          {
            id: 'two-columns',
            label: '2 Columns',
            content: '<div style="display: flex; gap: 16px;"><div style="flex: 1;" data-gjs-type="text">Column 1</div><div style="flex: 1;" data-gjs-type="text">Column 2</div></div>',
            category: 'Layout',
          },
          {
            id: 'variable',
            label: 'Variable',
            content: '<span data-gjs-type="text">{{variable}}</span>',
            category: 'Data',
          },
          {
            id: 'conditional',
            label: 'Conditional',
            content: '<div data-gjs-type="text">{{#if condition}}Show when true{{/if}}</div>',
            category: 'Data',
          },
        ],
      },
    })

    // Block permission enforcement: prevent selecting locked components
    editor.on('component:selected', (component) => {
      const attrs = component.getAttributes()
      if (attrs?.['data-permission'] === 'locked') {
        editor.select(undefined)
      }
    })

    // Load existing template content
    if (template.emailHtml) {
      editor.setComponents(template.emailHtml)
    }
    if (template.emailCss) {
      editor.setStyle(template.emailCss)
    }

    editorRef.current = editor

    // Cleanup on unmount
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [template])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!editorRef.current || !template) return

    setIsSaving(true)
    try {
      const editor = editorRef.current
      const emailHtml = editor.getHtml()
      const emailCss = editor.getCss() ?? undefined

      await updateMutation.mutateAsync({
        id: template.id,
        data: {
          emailHtml,
          emailCss,
        },
      })

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
  }, [template, updateMutation, toast])

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
        <h3 className="text-sm font-medium text-ash-900">Error loading template</h3>
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
        <h3 className="text-sm font-medium text-ash-900">Template not found</h3>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ash-200 bg-white">
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
            <h1 className="text-lg font-semibold text-ash-900">{template.name}</h1>
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
          </div>
        </div>

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

      {/* GrapesJS Editor Container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
