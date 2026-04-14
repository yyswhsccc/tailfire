'use client'

import { useState } from 'react'
import { FileText, Search, Loader2, ArrowLeft } from 'lucide-react'
import { useEmailTemplates, useRenderTemplate } from '@/hooks/use-email-templates'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TemplatePickerProps {
  tripId?: string
  contactId?: string
  onInsert: (result: { subject: string; bodyHtml: string; unresolvedVariables: string[] }) => void
  children?: React.ReactNode
}

export function TemplatePicker({
  tripId,
  contactId,
  onInsert,
  children,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<{
    subject: string
    bodyHtml: string
    unresolvedVariables: string[]
  } | null>(null)

  const { data: templates, isLoading } = useEmailTemplates({
    search: search || undefined,
    isActive: true,
  })
  const renderTemplate = useRenderTemplate()

  const handlePreview = async (slug: string) => {
    setPreviewSlug(slug)
    try {
      const result = await renderTemplate.mutateAsync({ slug, tripId, contactId })
      setPreviewResult(result)
    } catch {
      setPreviewResult(null)
    }
  }

  const handleInsert = () => {
    if (!previewResult) return
    onInsert(previewResult)
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setSearch('')
    setPreviewSlug(null)
    setPreviewResult(null)
  }

  const handleBack = () => {
    setPreviewSlug(null)
    setPreviewResult(null)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
        else setOpen(true)
      }}
    >
      <PopoverTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs">Template</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        {previewSlug ? (
          // Preview state
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium truncate">Template Preview</span>
            </div>
            {renderTemplate.isPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : previewResult ? (
              <>
                <div className="border-b px-3 py-2">
                  <div className="text-xs text-muted-foreground">Subject</div>
                  <div className="text-sm font-medium">
                    {previewResult.subject || '(no subject)'}
                  </div>
                </div>
                <ScrollArea className="max-h-48 px-3 py-2">
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: previewResult.bodyHtml }}
                  />
                </ScrollArea>
                {previewResult.unresolvedVariables.length > 0 && (
                  <div className="border-t px-3 py-2">
                    <div className="text-xs text-amber-600">
                      Unresolved: {previewResult.unresolvedVariables.join(', ')}
                    </div>
                  </div>
                )}
                <div className="border-t p-2">
                  <Button size="sm" className="w-full" onClick={handleInsert}>
                    Insert Template
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Failed to load preview
              </div>
            )}
          </div>
        ) : (
          // List state
          <>
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="max-h-64">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : templates && templates.length > 0 ? (
                <div className="py-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
                      onClick={() => handlePreview(t.slug)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t.category}
                          </Badge>
                          {t.description && (
                            <span className="truncate text-xs text-muted-foreground">
                              {t.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No templates found
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
