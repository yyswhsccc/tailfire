'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  GitFork,
  Upload,
  Lock,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { confirmDialog } from '@/components/ui/confirmation-dialog'
import {
  useDocumentTemplates,
  useTemplatePreview,
  useForkDocumentTemplate,
  usePublishDocumentTemplate,
  useDeleteDocumentTemplate,
  type DocumentTemplate,
  type DocumentTemplateFilters,
  type TemplateCategory,
} from '@/hooks/use-document-templates'

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  trip_order: 'Trip Order',
  payment: 'Payment',
  email: 'Email',
  proposal: 'Proposal',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
}

// ============================================================================
// Helpers
// ============================================================================

function isSystemTemplate(template: DocumentTemplate): boolean {
  return template.agencyId === null
}

function groupByCategory(templates: DocumentTemplate[]): Record<TemplateCategory, DocumentTemplate[]> {
  const groups: Record<TemplateCategory, DocumentTemplate[]> = {
    trip_order: [],
    payment: [],
    email: [],
    proposal: [],
  }

  for (const template of templates) {
    const category = template.category as TemplateCategory
    if (groups[category]) {
      groups[category].push(template)
    }
  }

  return groups
}

// ============================================================================
// Page Component
// ============================================================================

export default function TemplatesLibraryPage() {
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'pdf' | 'email'>('pdf')
  const { toast } = useToast()

  // Build filters
  const filters: DocumentTemplateFilters = {}
  if (categoryFilter !== 'all') filters.category = categoryFilter

  // Fetch templates
  const { data: templates, isLoading, error } = useDocumentTemplates(filters)

  // Mutations
  const forkMutation = useForkDocumentTemplate()
  const publishMutation = usePublishDocumentTemplate()
  const deleteMutation = useDeleteDocumentTemplate()

  // Preview
  const { data: previewData, isLoading: isPreviewLoading } = useTemplatePreview(previewSlug)

  // Auto-select best available preview mode when data loads
  useEffect(() => {
    if (previewData) {
      if (previewData.pdfHtml) setPreviewMode('pdf')
      else if (previewData.html) setPreviewMode('email')
    }
  }, [previewData])

  const handleFork = async (template: DocumentTemplate) => {
    try {
      await forkMutation.mutateAsync(template.id)
      toast({
        title: 'Template customized',
        description: `Created agency copy of "${template.name}"`,
      })
    } catch (err) {
      toast({
        title: 'Failed to customize template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handlePublish = async (template: DocumentTemplate) => {
    try {
      await publishMutation.mutateAsync(template.id)
      toast({
        title: 'Template published',
        description: `"${template.name}" is now live`,
      })
    } catch (err) {
      toast({
        title: 'Failed to publish template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (template: DocumentTemplate) => {
    const confirmed = await confirmDialog({
      title: 'Delete template?',
      description: `This will archive "${template.name}". This action can be undone by an administrator.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })

    if (!confirmed) return

    try {
      await deleteMutation.mutateAsync(template.id)
      toast({
        title: 'Template deleted',
        description: `"${template.name}" has been archived`,
      })
    } catch (err) {
      toast({
        title: 'Failed to delete template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  // Group templates by category (only when showing all)
  const grouped = templates ? groupByCategory(templates) : null

  // Determine which categories to show
  const categoriesToShow: TemplateCategory[] =
    categoryFilter !== 'all'
      ? [categoryFilter]
      : (['trip_order', 'payment', 'email', 'proposal'] as const).filter(
          (cat) => grouped && grouped[cat].length > 0
        )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Document Templates</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Manage templates for trip orders, invoices, proposals, and emails
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as TemplateCategory | 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="trip_order">Trip Order</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">
            Error loading templates
          </h3>
          <p className="mt-1 text-sm text-ash-500">{error.message}</p>
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
          <FileText className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">
            {categoryFilter !== 'all' ? 'No templates found' : 'No templates yet'}
          </h3>
          <p className="mt-1 text-sm text-ash-500">
            {categoryFilter !== 'all'
              ? 'Try adjusting your filter'
              : 'Document templates will appear here once configured'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {categoriesToShow.map((category) => {
            const categoryTemplates = grouped?.[category] ?? []
            if (categoryTemplates.length === 0) return null

            return (
              <div key={category}>
                <h2 className="text-lg font-semibold text-ash-800 mb-3">
                  {CATEGORY_LABELS[category]}
                </h2>
                <div className="border border-ash-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[280px]">Template</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryTemplates.map((template) => (
                        <TemplateRow
                          key={template.id}
                          template={template}
                          onPreview={(t) => setPreviewSlug(t.slug)}
                          onFork={handleFork}
                          onPublish={handlePublish}
                          onDelete={handleDelete}
                          isForking={forkMutation.isPending}
                          isPublishing={publishMutation.isPending}
                          isDeleting={deleteMutation.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewSlug} onOpenChange={(open) => { if (!open) setPreviewSlug(null) }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Template Preview</DialogTitle>
              {previewData && (previewData.pdfHtml || previewData.html) && (
                <div className="flex gap-1 rounded-lg bg-ash-100 p-1">
                  <button
                    onClick={() => setPreviewMode('pdf')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      previewMode === 'pdf'
                        ? 'bg-white text-ash-900 shadow-sm'
                        : 'text-ash-500 hover:text-ash-700'
                    }`}
                    disabled={!previewData.pdfHtml}
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => setPreviewMode('email')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      previewMode === 'email'
                        ? 'bg-white text-ash-900 shadow-sm'
                        : 'text-ash-500 hover:text-ash-700'
                    }`}
                    disabled={!previewData.html}
                  >
                    Email
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {isPreviewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
              </div>
            ) : (previewMode === 'pdf' ? previewData?.pdfHtml : previewData?.html) ? (
              <iframe
                srcDoc={previewMode === 'pdf' ? previewData!.pdfHtml! : previewData!.html!}
                className="w-full h-[60vh] border border-ash-200 rounded"
                title="Template Preview"
                sandbox=""
              />
            ) : (
              <div className="text-center py-12 text-ash-500">
                No {previewMode === 'pdf' ? 'PDF' : 'email'} HTML content to preview.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Template Row
// ============================================================================

interface TemplateRowProps {
  template: DocumentTemplate
  onPreview: (template: DocumentTemplate) => void
  onFork: (template: DocumentTemplate) => void
  onPublish: (template: DocumentTemplate) => void
  onDelete: (template: DocumentTemplate) => void
  isForking: boolean
  isPublishing: boolean
  isDeleting: boolean
}

function TemplateRow({
  template,
  onPreview,
  onFork,
  onPublish,
  onDelete,
  isForking,
  isPublishing,
  isDeleting,
}: TemplateRowProps) {
  const system = isSystemTemplate(template)

  return (
    <TableRow>
      {/* Name */}
      <TableCell>
        <div className="flex items-start gap-2">
          {system && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>System template (read-only)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div>
            <span className="font-medium">{template.name}</span>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {template.description}
              </p>
            )}
          </div>
        </div>
      </TableCell>

      {/* Slug */}
      <TableCell>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {template.slug}
        </code>
      </TableCell>

      {/* Version */}
      <TableCell>
        <span className="text-sm text-ash-600">v{template.version}</span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge
          variant="secondary"
          className={STATUS_COLORS[template.status] || STATUS_COLORS.draft}
        >
          {template.status}
        </Badge>
      </TableCell>

      {/* Output Types */}
      <TableCell>
        <div className="flex gap-1">
          {template.outputTypes.map((type) => (
            <Badge key={type} variant="outline" className="text-xs">
              {type}
            </Badge>
          ))}
        </div>
      </TableCell>

      {/* System / Agency Badge */}
      <TableCell>
        <Badge
          variant="secondary"
          className={system ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'}
        >
          {system ? 'System' : 'Customized'}
        </Badge>
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Preview — available for all templates */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview(template)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Preview template</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {system ? (
            /* System template: Edit + Customize (fork) buttons */
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/library/templates/${template.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFork(template)}
                      disabled={isForking}
                    >
                      <GitFork className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Customize template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          ) : (
            /* Agency template: Edit, Publish, Delete */
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/library/templates/${template.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {template.status === 'draft' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPublish(template)}
                        disabled={isPublishing}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Publish template</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(template)}
                      disabled={isDeleting}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
