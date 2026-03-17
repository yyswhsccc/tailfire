'use client'

import { Suspense, useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Map, Plus, Loader2, AlertCircle, Search, MoreHorizontal, Trash2, Edit2, ArrowLeft, PlusCircle } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useLoading } from '@/context/loading-context'
import { useUser } from '@/hooks/use-user'
import { api, ApiError } from '@/lib/api'
import type {
  ItineraryTemplateResponse,
  ItineraryTemplateListResponse,
} from '@tailfire/shared-types'
import { ItineraryTemplateModal } from './_components/itinerary-template-modal'

function ItineraryTemplatesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { stopLoading } = useLoading()
  const { agencyId } = useUser()

  // Context from trip (when navigated from Import button)
  const tripId = searchParams.get('tripId')
  const returnUrl = searchParams.get('returnUrl')

  const hasTripContext = !!tripId

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ItineraryTemplateResponse[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ItineraryTemplateResponse | null>(null)

  // Delete confirmation state
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)

  // Apply state
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)

  // Stop the navigation loading overlay once page has mounted
  useEffect(() => {
    stopLoading('itinerary-templates')
  }, [stopLoading])

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    if (!agencyId) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ agencyId })
      if (searchQuery) params.append('search', searchQuery)
      const response = await api.get<ItineraryTemplateListResponse>(
        `/templates/itineraries?${params.toString()}`
      )
      setTemplates(response.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }, [agencyId, searchQuery])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // Handle opening modal for new template
  const handleNewTemplate = useCallback(() => {
    setEditingTemplate(null)
    setIsModalOpen(true)
  }, [])

  // Handle opening modal for editing
  const handleEditTemplate = useCallback((template: ItineraryTemplateResponse) => {
    setEditingTemplate(template)
    setIsModalOpen(true)
  }, [])

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.delete(`/templates/itineraries/${id}`)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setDeleteTemplateId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }, [])

  // Handle modal save success
  const handleModalSuccess = useCallback(() => {
    fetchTemplates()
    setIsModalOpen(false)
    setEditingTemplate(null)
  }, [fetchTemplates])

  // Handle back to trip
  const handleBackToTrip = useCallback(() => {
    if (returnUrl) {
      router.push(returnUrl)
    }
  }, [returnUrl, router])

  // Handle apply template to trip
  const handleApplyTemplate = useCallback(async (template: ItineraryTemplateResponse) => {
    if (!tripId) return

    setApplyingTemplateId(template.id)
    try {
      // API will use trip start date if available, otherwise create days with TBD dates
      await api.post(`/trips/${tripId}/templates/itineraries/${template.id}/apply?agencyId=${agencyId}`, {})

      toast({
        title: 'Itinerary Created',
        description: `"${template.name}" has been applied to create a new itinerary.`,
      })

      // Navigate back to trip
      if (returnUrl) {
        router.push(returnUrl)
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to apply template'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setApplyingTemplateId(null)
    }
  }, [tripId, agencyId, returnUrl, router, toast])

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Get summary stats for a template
  const getTemplateSummary = (template: ItineraryTemplateResponse) => {
    const dayCount = template.payload.dayOffsets.length
    const activityCount = template.payload.dayOffsets.reduce(
      (sum, day) => sum + day.activities.length,
      0
    )
    return { dayCount, activityCount }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Map className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Itinerary Templates</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            {hasTripContext
              ? 'Select a template to create a new itinerary for your trip'
              : 'Save and reuse itinerary structures with days and activities'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasTripContext && returnUrl && (
            <Button variant="outline" onClick={handleBackToTrip}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Trip
            </Button>
          )}
          {!hasTripContext && (
            <Button onClick={handleNewTemplate}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ash-400" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">Error loading templates</h3>
          <p className="mt-1 text-sm text-ash-500">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchTemplates}>
            Try Again
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
          <Map className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">No templates yet</h3>
          <p className="mt-1 text-sm text-ash-500">
            {searchQuery
              ? 'No templates match your search'
              : hasTripContext
                ? 'No itinerary templates available. Save an existing itinerary as a template first.'
                : 'Create your first itinerary template to reuse trip structures'}
          </p>
          {!searchQuery && !hasTripContext && (
            <Button className="mt-4" onClick={handleNewTemplate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-ash-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Name</TableHead>
                <TableHead className="text-center">Days</TableHead>
                <TableHead className="text-center">Activities</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[150px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const { dayCount, activityCount } = getTemplateSummary(template)
                const isApplying = applyingTemplateId === template.id
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <div>
                        {template.name}
                        {template.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{dayCount}</TableCell>
                    <TableCell className="text-center">{activityCount}</TableCell>
                    <TableCell className="text-center">
                      {template.isActive ? (
                        <Badge variant="outline" className="border-green-300 text-green-700">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(template.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {hasTripContext && template.isActive && (
                          <Button
                            size="sm"
                            onClick={() => handleApplyTemplate(template)}
                            disabled={isApplying}
                          >
                            {isApplying ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <PlusCircle className="mr-2 h-4 w-4" />
                            )}
                            Add to Trip
                          </Button>
                        )}
                        {!hasTripContext && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                                <Edit2 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeleteTemplateId(template.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Info Section - only show when not in trip context */}
      {!hasTripContext && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900">Using Itinerary Templates</h4>
          <p className="mt-1 text-sm text-blue-700">
            Itinerary templates store reusable trip structures. Save an existing itinerary as a
            template, then apply it to new trips to quickly create similar itineraries with all days
            and activities pre-populated.
          </p>
        </div>
      )}

      {/* Template Modal - only show when not in trip context */}
      {!hasTripContext && (
        <ItineraryTemplateModal
          template={editingTemplate}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onSuccess={handleModalSuccess}
          agencyId={agencyId!}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTemplateId && handleDelete(deleteTemplateId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ItineraryTemplatesLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Map className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Itinerary Templates</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Save and reuse itinerary structures with days and activities
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
      </div>
    </div>
  )
}

export default function ItineraryTemplatesPage() {
  return (
    <Suspense fallback={<ItineraryTemplatesLoading />}>
      <ItineraryTemplatesContent />
    </Suspense>
  )
}
