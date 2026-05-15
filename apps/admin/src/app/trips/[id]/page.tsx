'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  Pencil,
  LayoutDashboard,
  Map,
  CheckSquare,
  ShoppingCart,
  CreditCard,
  Shield,
  DollarSign,
  FileText,
  Mail,
  FileCheck,
  StickyNote,
  Zap,
  Activity,
  Users,
  Trash2,
  XCircle,
  MoreVertical,
  Send,
  EyeOff,
  FolderInput,
  Copy,
  Eye,
  Image,
  Calendar,
  User,
  Link as LinkIcon,
  RotateCcw,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DetailLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTrip, useDeleteTrip, useUncancelTrip, usePublishTripSnapshot, useUnpublishTrip, useDuplicateTrip, useTripGroups } from '@/hooks/use-trips'
import { useUser } from '@/hooks/use-user'
import { MoveToGroupDialog } from '@/components/trips/MoveToGroupDialog'
import { TripOverview } from './_components/trip-overview'
import { TripTasks } from './_components/trip-tasks'
import { TripItinerary } from './_components/trip-itinerary'
import { TripAutomations } from './_components/trip-automations'
import { TripMediaTab } from './_components/trip-media-tab'
import { TripPackages } from './_components/trip-packages'
import { TripPayments } from './_components/trip-payments'
import { TripInsurance } from './_components/trip-insurance'
import { TripFormDialog } from '@/app/trips/_components/trip-form-dialog'
import { ActivityFeed } from '@/components/trips/ActivityFeed'
import { CancelTripDialog } from '@/components/trips/cancel-trip-dialog'
import { ServiceFeesPanel } from '@/components/financials/service-fees-panel'
import { ComposePanel } from '@/components/email-composer/compose-panel'
import { useEmailStore } from '@/stores/email.store'
import { Card } from '@/components/ui/card'
import { TripDetailSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { NotesSection } from '@/components/notes/NotesSection'
import {
  getTripStatusLabel,
  getTripStatusVariant,
  canDeleteTrip,
  type TripStatus,
} from '@/lib/trip-status-constants'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { useToast } from '@/hooks/use-toast'
import { TripTravelersTab, useTravelerValidationCount } from './_components/trip-travelers-tab'
import { EditTravelersDialog } from './_components/edit-travelers-dialog'
import { formatDate } from '@/lib/date-utils'
import { useLoading } from '@/context/loading-context'
import type { TripTravelerResponseDto } from '@tailfire/shared-types/api'

type ActiveTab = 'overview' | 'itinerary' | 'tasks' | 'bookings' | 'payments' | 'insurance' | 'service-fees' | 'documents' | 'emails' | 'forms' | 'notes' | 'automations' | 'activity' | 'travelers' | 'media'

const getSidebarNav = (activeTab: ActiveTab, setActiveTab: (tab: ActiveTab) => void, travelerIssueCount: number = 0) => [
  {
    title: 'General',
    items: [
      {
        name: 'Overview',
        href: '#overview',
        icon: LayoutDashboard,
        isActive: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        name: 'Itinerary',
        href: '#itinerary',
        icon: Map,
        isActive: activeTab === 'itinerary',
        onClick: () => setActiveTab('itinerary'),
      },
      {
        name: 'Tasks',
        href: '#tasks',
        icon: CheckSquare,
        isActive: activeTab === 'tasks',
        onClick: () => setActiveTab('tasks'),
      },
    ],
  },
  {
    title: 'Finances',
    items: [
      {
        name: 'Bookings',
        href: '#bookings',
        icon: ShoppingCart,
        isActive: activeTab === 'bookings',
        onClick: () => setActiveTab('bookings'),
      },
      {
        name: 'Payments',
        href: '#payments',
        icon: CreditCard,
        isActive: activeTab === 'payments',
        onClick: () => setActiveTab('payments'),
      },
      {
        name: 'Insurance',
        href: '#insurance',
        icon: Shield,
        isActive: activeTab === 'insurance',
        onClick: () => setActiveTab('insurance'),
      },
      {
        name: 'Service Fees',
        href: '#service-fees',
        icon: DollarSign,
        isActive: activeTab === 'service-fees',
        onClick: () => setActiveTab('service-fees'),
      },
    ],
  },
  {
    title: 'More',
    items: [
      {
        name: 'Documents',
        href: '#documents',
        icon: FileText,
        isActive: activeTab === 'documents',
        onClick: () => setActiveTab('documents'),
      },
      {
        name: 'Emails',
        href: '#emails',
        icon: Mail,
        isActive: activeTab === 'emails',
        onClick: () => setActiveTab('emails'),
      },
      {
        name: 'Forms',
        href: '#forms',
        icon: FileCheck,
        isActive: activeTab === 'forms',
        onClick: () => setActiveTab('forms'),
      },
      {
        name: 'Notes',
        href: '#notes',
        icon: StickyNote,
        isActive: activeTab === 'notes',
        onClick: () => setActiveTab('notes'),
      },
      {
        name: 'Automations',
        href: '#automations',
        icon: Zap,
        isActive: activeTab === 'automations',
        onClick: () => setActiveTab('automations'),
      },
      {
        name: 'Activity',
        href: '#activity',
        icon: Activity,
        isActive: activeTab === 'activity',
        onClick: () => setActiveTab('activity'),
      },
      {
        name: 'Travelers',
        href: '#travelers',
        icon: Users,
        isActive: activeTab === 'travelers',
        onClick: () => setActiveTab('travelers'),
        badge: travelerIssueCount > 0 ? travelerIssueCount.toString() : undefined,
      },
      {
        name: 'Media',
        href: '#media',
        icon: Image,
        isActive: activeTab === 'media',
        onClick: () => setActiveTab('media'),
      },
    ],
  },
]

// Wrapper functions for backward compatibility
function getStatusVariant(status: string): 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled' {
  return getTripStatusVariant(status as TripStatus)
}

function getStatusLabel(status: string): string {
  return getTripStatusLabel(status as TripStatus)
}

/**
 * Get traveler display name from snapshot or contact
 */
function getTravelerName(traveler: TripTravelerResponseDto): string {
  if (traveler.contactSnapshot?.firstName || traveler.contactSnapshot?.lastName) {
    const first = traveler.contactSnapshot.firstName || ''
    const last = traveler.contactSnapshot.lastName || ''
    return `${first} ${last}`.trim()
  }
  if (traveler.contact?.firstName || traveler.contact?.lastName) {
    const first = traveler.contact.firstName || ''
    const last = traveler.contact.lastName || ''
    return `${first} ${last}`.trim()
  }
  return 'Unknown Traveler'
}

/**
 * Trip Detail Page
 * Displays trip details with sidebar navigation and tabbed content
 */
export default function TripDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tripId = params?.id as string
  const { stopLoading } = useLoading()
  const { toast } = useToast()

  // Initialize activeTab from URL query param or default to 'overview'
  const initialTab = searchParams.get('tab') as ActiveTab | null
  const validTabs: ActiveTab[] = ['overview', 'itinerary', 'tasks', 'bookings', 'payments', 'insurance', 'service-fees', 'documents', 'emails', 'forms', 'notes', 'automations', 'activity', 'travelers', 'media']
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview'
  )
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showEditTripDialog, setShowEditTripDialog] = useState(false)
  const [isHeaderHovered, setIsHeaderHovered] = useState(false)

  // Track the last URL tab value to detect actual URL changes (back/forward navigation)
  // This prevents React Query cache invalidations from resetting the tab
  const lastUrlTab = useRef<string | null>(initialTab)

  // Handle tab changes with URL sync
  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
    // Update ref to match new tab (prevents useEffect from re-triggering)
    lastUrlTab.current = tab === 'overview' ? null : tab
    // Use shallow routing to update URL without full page reload
    const newUrl = tab === 'overview'
      ? `/trips/${tripId}`
      : `/trips/${tripId}?tab=${tab}`
    router.replace(newUrl, { scroll: false })
  }, [tripId, router])

  // Sync activeTab with URL ONLY on actual URL changes (back/forward navigation)
  // Not on React Query re-renders which create new searchParams references
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    // Only update if the URL tab actually changed (not just a re-render)
    if (tabFromUrl !== lastUrlTab.current) {
      lastUrlTab.current = tabFromUrl
      const newTab = tabFromUrl && validTabs.includes(tabFromUrl as ActiveTab) ? (tabFromUrl as ActiveTab) : 'overview'
      setActiveTab(newTab)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteTrip = useDeleteTrip()
  const uncancelTrip = useUncancelTrip()
  const { isAdmin } = useUser()
  const publishSnapshot = usePublishTripSnapshot()
  const unpublishTrip = useUnpublishTrip()
  const duplicateTrip = useDuplicateTrip()
  const [showMoveToGroupDialog, setShowMoveToGroupDialog] = useState(false)
  const isDeleting = deleteTrip.isPending

  // Disable queries when deletion is in progress to prevent 404s
  const { data: trip, isLoading, error } = useTrip(tripId, { enabled: !isDeleting })
  const { data: tripGroups } = useTripGroups()

  const isDeletable = trip ? canDeleteTrip(trip.status) : false

  const handleDelete = async () => {
    if (!trip || !canDeleteTrip(trip.status)) return

    try {
      await deleteTrip.mutateAsync(trip.id)
      toast({ title: 'Trip deleted successfully' })
      // Use replace to prevent back-navigation to deleted trip
      router.replace('/trips')
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to delete trip'
      toast({ title: 'Error', description: message, variant: 'destructive' })
      setShowDeleteDialog(false)
    }
  }

  const handleCancelTrip = () => {
    setShowCancelDialog(true)
  }

  const handlePublish = async () => {
    if (!trip) return
    try {
      const updated = await publishSnapshot.mutateAsync(trip.id)
      const token = updated.shareToken || trip.shareToken
      if (!token) {
        toast({ title: 'Error', description: 'No share token generated. Try again.', variant: 'destructive' })
        return
      }
      const shareUrl = `${getClientOrigin()}/shared/trips/${token}`
      await navigator.clipboard.writeText(shareUrl)

      // Multi-itinerary: show which itineraries were published
      if (updated.publishedItineraries && updated.publishedItineraries.length > 0) {
        const names = updated.publishedItineraries
          .map((it) => `${it.name} v${it.versionNumber}`)
          .join(', ')
        toast({
          title: `Published ${updated.publishedItineraries.length} itinerar${updated.publishedItineraries.length === 1 ? 'y' : 'ies'}`,
          description: `${names}. Share link copied.`,
        })
      } else {
        const versionLabel = updated.versionNumber ? ` (v${updated.versionNumber})` : ''
        toast({ title: 'Published' + versionLabel, description: 'New version live for clients. Share link copied.' })
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to publish trip.'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    }
  }

  const handleUnpublish = async () => {
    if (!trip) return
    try {
      await unpublishTrip.mutateAsync(trip.id)
      toast({ title: 'Trip unpublished' })
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to unpublish trip.', variant: 'destructive' })
    }
  }

  const getClientOrigin = () => {
    if (process.env.NEXT_PUBLIC_CLIENT_URL) return process.env.NEXT_PUBLIC_CLIENT_URL
    const origin = window.location.origin
    if (origin.includes(':3100')) return origin.replace(':3100', ':3103')
    // B5 (Al's domain decision 2026-05-15): client portal lives at my.phoenixvoyages.ca
    if (origin.includes('tailfire.phoenixvoyages.ca')) return 'https://my.phoenixvoyages.ca'
    return origin.replace('admin', 'my')
  }

  const handleCopyShareLink = () => {
    if (!trip?.shareToken) return
    const shareUrl = `${getClientOrigin()}/shared/trips/${trip.shareToken}`
    navigator.clipboard.writeText(shareUrl)
    toast({ title: 'Share link copied to clipboard' })
  }

  const handlePreview = () => {
    if (!trip) return
    router.push(`/trips/${trip.id}/preview`)
  }

  const handleDuplicate = async () => {
    if (!trip) return
    try {
      const newTrip = await duplicateTrip.mutateAsync(trip.id)
      toast({ title: 'Trip duplicated', description: `Created "${newTrip.name}"` })
      router.push(`/trips/${newTrip.id}`)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to duplicate trip.', variant: 'destructive' })
    }
  }

  // Stop any navigation loading overlay when trip data loads
  useEffect(() => {
    if (!isLoading && trip) {
      stopLoading('trip-navigation')
    }
  }, [isLoading, trip, stopLoading])

  // Disable all trip-related queries when deletion is in progress
  const { data: travelers = [], isLoading: loadingTravelers } = useTripTravelers(tripId, { enabled: !isDeleting })

  // Get primary traveler for header display
  const primaryTraveler = travelers.find((traveler) => traveler.contactId === trip?.primaryContactId)

  // Validation count for sidebar badge (red count pill)
  const travelerIssueCount = useTravelerValidationCount(tripId, trip?.startDate)

  // Edit Travelers dialog state
  const [showEditTravelersDialog, setShowEditTravelersDialog] = useState(false)

  // Build group back link if trip belongs to a group
  const tripGroup = trip?.tripGroupId ? tripGroups?.find((g) => g.id === trip.tripGroupId) : null
  const additionalBackLinks = tripGroup
    ? [{ href: `/trips/groups/${tripGroup.id}`, label: tripGroup.name }]
    : undefined

  if (isLoading) {
    return (
      <DetailLayout
        backHref="/trips"
        backLabel="Trips"
        sidebarSections={getSidebarNav(activeTab, handleTabChange, travelerIssueCount)}
      >
        <TripDetailSkeleton />
      </DetailLayout>
    )
  }

  if (error || !trip) {
    return (
      <DetailLayout
        backHref="/trips"
        backLabel="Trips"
        sidebarSections={getSidebarNav(activeTab, handleTabChange, travelerIssueCount)}
      >
        <div className="p-6">
          <EmptyState
            icon={<Map className="h-6 w-6" />}
            title="Failed to load trip"
            description="There was an error loading the trip details. Please try again."
            action={{
              label: 'Retry',
              onClick: () => window.location.reload(),
            }}
          />
        </div>
      </DetailLayout>
    )
  }

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <TripOverview trip={trip} />
      case 'itinerary':
        return <TripItinerary trip={trip} />
      case 'activity':
        return (
          <Card>
            <div className="flex flex-col gap-6">
              <h2 className="text-lg font-semibold text-ash-900">Activity Log</h2>
              <ActivityFeed tripId={trip.id} limit={20} showLoadMore={true} />
            </div>
          </Card>
        )
      case 'travelers':
        return <TripTravelersTab
          tripId={trip.id}
          tripStartDate={trip.startDate}
          onManageTravelers={() => setShowEditTravelersDialog(true)}
        />
      case 'media':
        return <TripMediaTab trip={trip} />
      case 'payments':
        return <TripPayments trip={trip} />
      case 'service-fees':
        return (
          <Card>
            <div className="flex flex-col gap-6">
              <ServiceFeesPanel
                tripId={trip.id}
                agencyId={trip.agencyId ?? undefined}
                currency={trip.currency || 'CAD'}
              />
            </div>
          </Card>
        )
      case 'bookings':
        return <TripPackages trip={trip} />
      case 'insurance':
        return <TripInsurance trip={trip} />
      case 'notes':
        return <NotesSection tripId={trip.id} />
      case 'tasks':
        return <TripTasks trip={trip} />
      case 'automations':
        return <TripAutomations trip={trip} />
      case 'documents':
      case 'emails':
      case 'forms':
        return (
          <EmptyState
            title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace(/-/g, ' ')}`}
            description="This feature is in development and will be available in a future update."
          />
        )
      default:
        return <TripOverview trip={trip} />
    }
  }

  return (
    <DetailLayout
      backHref="/trips"
      backLabel="Trips"
      additionalBackLinks={additionalBackLinks}
      sidebarSections={getSidebarNav(activeTab, handleTabChange, travelerIssueCount)}
    >
      <div className="p-6">
        {/* Header */}
        <div className="border-b border-ash-200 pb-4 mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div
              className="flex items-center gap-2 group"
              onMouseEnter={() => setIsHeaderHovered(true)}
              onMouseLeave={() => setIsHeaderHovered(false)}
            >
              <h1 className="text-lg font-semibold leading-tight text-ash-900">{trip.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-phoenix-gold-500 focus-visible:ring-offset-2 ${isHeaderHovered ? 'opacity-100' : 'opacity-0'}`}
                aria-label="Edit trip name"
                onClick={() => setShowEditTripDialog(true)}
              >
                <Pencil className="h-3.5 w-3.5 text-ash-500" aria-hidden="true" />
              </Button>
            </div>
            {/* Status, Type, Dates & Primary Contact - single compact row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <Badge variant={getStatusVariant(trip.status)}>
                {getStatusLabel(trip.status)}
              </Badge>
              <span>Regular Trip</span>
              {/* Dates */}
              {trip.startDate && (
                <>
                  <span className="text-ash-300">•</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {formatDate(trip.startDate, trip.timezone || undefined)}
                      {trip.endDate && ` – ${formatDate(trip.endDate, trip.timezone || undefined)}`}
                    </span>
                  </div>
                </>
              )}
              {/* Primary Contact */}
              {primaryTraveler ? (
                <>
                  <span className="text-ash-300">•</span>
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{getTravelerName(primaryTraveler)}</span>
                  </div>
                </>
              ) : !loadingTravelers && trip.primaryContactId ? (
                <>
                  <span className="text-ash-300">•</span>
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="italic">Primary contact not on trip</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Trip Actions Context Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Trip actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setShowEditTripDialog(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Trip
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!trip?.isPublished ? (
                  <DropdownMenuItem onClick={handlePublish} disabled={publishSnapshot.isPending}>
                    <Send className="h-4 w-4 mr-2" />
                    {publishSnapshot.isPending ? 'Publishing...' : 'Publish Trip'}
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={handleCopyShareLink}>
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Copy Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleUnpublish} disabled={unpublishTrip.isPending}>
                      <EyeOff className="h-4 w-4 mr-2" />
                      {unpublishTrip.isPending ? 'Unpublishing...' : 'Unpublish Trip'}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowMoveToGroupDialog(true)}>
                  <FolderInput className="h-4 w-4 mr-2" />
                  Move to Group
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate} disabled={duplicateTrip.isPending}>
                  <Copy className="h-4 w-4 mr-2" />
                  {duplicateTrip.isPending ? 'Duplicating...' : 'Duplicate Trip'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {trip.status === 'cancelled' && isAdmin && (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await uncancelTrip.mutateAsync(trip.id)
                        toast({ title: 'Trip restored', description: 'Trip has been un-cancelled.' })
                      } catch (error: any) {
                        toast({ title: 'Failed to un-cancel', description: error?.message || 'An error occurred.', variant: 'destructive' })
                      }
                    }}
                    disabled={uncancelTrip.isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {uncancelTrip.isPending ? 'Restoring...' : 'Un-cancel Trip'}
                  </DropdownMenuItem>
                )}
                {isDeletable ? (
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleteTrip.isPending}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteTrip.isPending ? 'Deleting...' : 'Delete Trip'}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={handleCancelTrip}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Trip
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {trip.status === 'cancelled' && isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await uncancelTrip.mutateAsync(trip.id)
                    toast({ title: 'Trip restored', description: 'Trip has been un-cancelled.' })
                  } catch (error: any) {
                    toast({ title: 'Failed to un-cancel', description: error?.message || 'An error occurred.', variant: 'destructive' })
                  }
                }}
                disabled={uncancelTrip.isPending}
              >
                {uncancelTrip.isPending ? 'Restoring...' : 'Un-cancel Trip'}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
              const recipients: { address: string; name?: string }[] = []
              if (trip.primaryContact?.email) {
                recipients.push({ address: trip.primaryContact.email, name: trip.primaryContact.displayName })
              }
              useEmailStore.getState().openCompose({
                mode: 'new',
                tripId: trip.id,
                contactId: trip.primaryContactId ?? undefined,
                prefillTo: recipients,
                prefillSubject: trip.name || '',
              })
            }}>
              <Mail className="h-4 w-4" />
              Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePreview}>
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handlePublish} disabled={publishSnapshot.isPending}>
              <Send className="h-4 w-4" />
              {publishSnapshot.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the trip and all associated data including
              travelers and itineraries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTrip.isPending}
            >
              {deleteTrip.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Trip Dialog */}
      <TripFormDialog
        open={showEditTripDialog}
        onOpenChange={setShowEditTripDialog}
        mode="edit"
        trip={trip}
      />

      {/* Cancel Trip Dialog */}
      {trip && (
        <CancelTripDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          tripId={trip.id}
          tripName={trip.name}
        />
      )}

      {/* Move to Group Dialog */}
      {trip && (
        <MoveToGroupDialog
          open={showMoveToGroupDialog}
          onOpenChange={setShowMoveToGroupDialog}
          tripId={trip.id}
          currentGroupId={trip.tripGroupId}
        />
      )}

      {/* Edit Travelers Dialog */}
      {trip && (
        <EditTravelersDialog
          open={showEditTravelersDialog}
          onOpenChange={setShowEditTravelersDialog}
          trip={trip}
        />
      )}
      <ComposePanel />
    </DetailLayout>
  )
}
