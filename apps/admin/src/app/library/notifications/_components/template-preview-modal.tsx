'use client'

import { Loader2, Mail, FileText, Code } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useEmailTemplatePreview } from '@/hooks/use-email-templates'
import type { EmailTemplateResponse } from '@tailfire/shared-types'

interface TemplatePreviewModalProps {
  template: EmailTemplateResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Template Preview Modal
 *
 * Displays a rendered preview of an email template with sample data.
 * Shows HTML preview, plain text, and variable substitutions.
 */
export function TemplatePreviewModal({ template, open, onOpenChange }: TemplatePreviewModalProps) {
  const { data: preview, isLoading, error } = useEmailTemplatePreview(template?.slug ?? null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {template?.name || 'Template Preview'}
          </DialogTitle>
          <DialogDescription>
            Preview rendered with sample data. Variables have been replaced with example values.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-600">Failed to load preview: {error.message}</p>
          </div>
        ) : preview ? (
          <Tabs defaultValue="html" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="html" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                HTML Preview
              </TabsTrigger>
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Plain Text
              </TabsTrigger>
              <TabsTrigger value="variables" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Variables
              </TabsTrigger>
            </TabsList>

            {/* Subject Line */}
            <div className="mt-4 p-3 bg-muted rounded-md">
              <div className="text-xs text-muted-foreground mb-1">Subject</div>
              <div className="font-medium">{preview.subject}</div>
            </div>

            <TabsContent value="html" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[400px] border rounded-md">
                <iframe
                  srcDoc={preview.bodyHtml}
                  title="Email Preview"
                  className="w-full h-[400px] border-0"
                  sandbox="allow-same-origin"
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="text" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[400px] border rounded-md p-4">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {preview.bodyText || 'No plain text version available'}
                </pre>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="variables" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[400px]">
                {preview.variables.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No variables used in this template
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-4">
                      The following variables were found in this template and replaced with sample
                      values:
                    </p>

                    <Accordion type="single" collapsible className="w-full">
                      {groupVariablesByCategory(preview.variables).map((group) => (
                        <AccordionItem key={group.category} value={group.category}>
                          <AccordionTrigger className="text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{group.category}</Badge>
                              <span className="text-muted-foreground">
                                ({group.variables.length} variable
                                {group.variables.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {group.variables.map((variable) => (
                                <div
                                  key={variable.key}
                                  className="flex items-start justify-between gap-4 py-2 px-3 bg-muted/50 rounded"
                                >
                                  <div className="min-w-0 flex-1">
                                    <code className="text-xs font-mono text-primary">
                                      {`{{${variable.key}}}`}
                                    </code>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {variable.description}
                                    </p>
                                  </div>
                                  <div className="text-sm font-medium text-right">
                                    {variable.value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Group variables by their category (first part of the key before the dot)
 */
function groupVariablesByCategory(
  variables: Array<{ key: string; value: string; description: string }>
): Array<{ category: string; variables: Array<{ key: string; value: string; description: string }> }> {
  const groups = new Map<
    string,
    Array<{ key: string; value: string; description: string }>
  >()

  for (const variable of variables) {
    const category = variable.key.split('.')[0] || 'other'
    const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)

    if (!groups.has(categoryTitle)) {
      groups.set(categoryTitle, [])
    }
    groups.get(categoryTitle)!.push(variable)
  }

  return Array.from(groups.entries())
    .map(([category, vars]) => ({ category, variables: vars }))
    .sort((a, b) => a.category.localeCompare(b.category))
}
