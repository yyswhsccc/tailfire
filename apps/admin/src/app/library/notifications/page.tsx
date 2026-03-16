'use client'

import { useState } from 'react'
import { Mail, Loader2, AlertCircle, Search, Eye, Send, Lock, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useEmailTemplates, type EmailTemplateFilters } from '@/hooks/use-email-templates'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { TemplatePreviewModal } from './_components/template-preview-modal'
import { TestEmailDialog } from './_components/test-email-dialog'
import type { EmailTemplateResponse, EmailCategory } from '@tailfire/shared-types'

/**
 * Email Templates Library Page
 *
 * Browse and manage email templates used for automations.
 * Preview templates with sample data and send test emails.
 */
export default function NotificationsLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<EmailCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Preview and test state
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateResponse | null>(null)
  const [testTemplate, setTestTemplate] = useState<EmailTemplateResponse | null>(null)

  // Debounce search input
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSetSearch(value)
  }

  // Build filters
  const filters: EmailTemplateFilters = {}
  if (debouncedSearch) filters.search = debouncedSearch
  if (categoryFilter !== 'all') filters.category = categoryFilter
  if (statusFilter !== 'all') filters.isActive = statusFilter === 'active'

  // Fetch templates
  const { data: templates, isLoading, error } = useEmailTemplates(filters)

  const getCategoryBadge = (category: EmailCategory | null) => {
    if (!category) return null
    const categoryColors: Record<string, string> = {
      trip_order: 'bg-blue-100 text-blue-800',
      notification: 'bg-purple-100 text-purple-800',
      marketing: 'bg-green-100 text-green-800',
      system: 'bg-gray-100 text-gray-800',
      payment: 'bg-amber-100 text-amber-800',
      client_care: 'bg-pink-100 text-pink-800',
    }
    const categoryLabels: Record<string, string> = {
      trip_order: 'Trip Order',
      notification: 'Notification',
      marketing: 'Marketing',
      system: 'System',
      payment: 'Payment',
      client_care: 'Client Care',
    }
    return (
      <Badge variant="secondary" className={categoryColors[category] || categoryColors.system}>
        {categoryLabels[category] || category}
      </Badge>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Mail className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Email Templates</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Browse and preview email templates used for automations and notifications
          </p>
        </div>
      </div>

      {/* Tabs for Email vs SMS */}
      <Tabs defaultValue="email" className="w-full">
        <TabsList>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Templates
          </TabsTrigger>
          <TabsTrigger value="sms" disabled className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Templates
            <Badge variant="outline" className="ml-1 text-xs">
              Soon
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-6 space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as EmailCategory | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="trip_order">Trip Order</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="client_care">Client Care</SelectItem>
                <SelectItem value="notification">Notification</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
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
              <Mail className="mx-auto h-12 w-12 text-ash-400" />
              <h3 className="mt-2 text-sm font-medium text-ash-900">
                {debouncedSearch || categoryFilter !== 'all' || statusFilter !== 'all'
                  ? 'No templates found'
                  : 'No templates yet'}
              </h3>
              <p className="mt-1 text-sm text-ash-500">
                {debouncedSearch || categoryFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Email templates will appear here once configured'}
              </p>
            </div>
          ) : (
            <div className="border border-ash-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Template</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow
                      key={template.id}
                      className={!template.isActive ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <div className="flex items-start gap-2">
                          {template.isSystem && (
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
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {template.slug}
                        </code>
                      </TableCell>
                      <TableCell>{getCategoryBadge(template.category)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={template.isActive ? 'default' : 'secondary'}
                          className={
                            template.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {template.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPreviewTemplate(template)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Preview template</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setTestTemplate(template)}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Send test email</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sms">
          <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
            <MessageSquare className="mx-auto h-12 w-12 text-ash-400" />
            <h3 className="mt-2 text-sm font-medium text-ash-900">SMS Templates</h3>
            <p className="mt-1 text-sm text-ash-500">
              SMS templates will be available in a future release
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      />

      {/* Test Email Dialog */}
      <TestEmailDialog
        template={testTemplate}
        open={!!testTemplate}
        onOpenChange={(open) => !open && setTestTemplate(null)}
      />
    </div>
  )
}
