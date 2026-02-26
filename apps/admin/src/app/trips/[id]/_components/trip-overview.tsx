import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, MapPin, User, Users, Plus, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react'
import type { TripResponseDto, ItineraryResponseDto } from '@tailfire/shared-types/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ITINERARY_CARD_STYLES, SKELETON_BG, FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import { cn } from '@/lib/utils'
import { CreateItineraryDialog } from './create-itinerary-dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/components/ui/tag-input'
import { DateDisplay } from '@/components/ui/date-display'
import { ActivityFeed } from '@/components/trips/ActivityFeed'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { useUpdateTrip } from '@/hooks/use-trips'
import { useItineraries } from '@/hooks/use-itineraries'
import { useTripTags, useUpdateTripTags, useCreateAndAssignTripTag } from '@/hooks/use-tags'
import { EditTravelersDialog } from './edit-travelers-dialog'

interface TripOverviewProps {
  trip: TripResponseDto
}

/**
 * Trip Overview Tab
 * Displays get started actions, activity timeline, travelers, itinerary, and settings
 */
export function TripOverview({ trip }: TripOverviewProps) {
  const router = useRouter()
  const [showEditTravelersDialog, setShowEditTravelersDialog] = useState(false)
  const [showCreateItineraryDialog, setShowCreateItineraryDialog] = useState(false)
  const [expandedTravelers, setExpandedTravelers] = useState<Set<string>>(new Set())
  const { data: travelers = [], isLoading: loadingTravelers } = useTripTravelers(trip.id)
  const { data: itineraries, isLoading: loadingItineraries, error: itinerariesError, refetch: refetchItineraries } = useItineraries(trip.id)
  const { data: tripTags = [] } = useTripTags(trip.id)
  const updateTrip = useUpdateTrip()
  const updateTripTags = useUpdateTripTags()
  const createAndAssignTag = useCreateAndAssignTripTag()

  // Check if trip has itineraries to determine if Get Started should show
  const hasItineraries = itineraries && itineraries.length > 0

  // Quick action handlers
  const handleAddTravelers = () => setShowEditTravelersDialog(true)
  const handleDraftItinerary = () => router.replace(`/trips/${trip.id}?tab=itinerary`, { scroll: false })
  const handleTrackBookings = () => router.replace(`/trips/${trip.id}?tab=bookings`, { scroll: false })

  // @ts-expect-error Reserved for future use in trip header
  const _primaryTraveler = useMemo(
    () =>
      trip.primaryContactId
        ? travelers.find((traveler) => traveler.contactId === trip.primaryContactId)
        : undefined,
    [travelers, trip.primaryContactId],
  )

  const handleUpdateSetting = <K extends keyof TripResponseDto>(
    key: K,
    value: TripResponseDto[K]
  ) => {
    updateTrip.mutate({
      id: trip.id,
      data: { [key]: value } as any,
    })
  }

  const toggleTraveler = (travelerId: string) => {
    setExpandedTravelers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(travelerId)) {
        newSet.delete(travelerId)
      } else {
        newSet.add(travelerId)
      }
      return newSet
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content - Left Side (2 columns) */}
      <div className="lg:col-span-2 space-y-6">
        {/* Get Started Section - Hidden when trip has itineraries */}
        {!hasItineraries && (
          <Card className="p-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-ash-900">Get Started</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <QuickActionCard
                  icon={<Users className="h-5 w-5 text-phoenix-gold-600" />}
                  title="Add Travelers"
                  description="Manage trip participants"
                  onClick={handleAddTravelers}
                />
                <QuickActionCard
                  icon={<MapPin className="h-5 w-5 text-phoenix-gold-600" />}
                  title="Draft an itinerary"
                  description="Share plans and options"
                  onClick={handleDraftItinerary}
                />
                <QuickActionCard
                  icon={<Calendar className="h-5 w-5 text-phoenix-gold-600" />}
                  title="Track bookings"
                  description="Report sales and commission"
                  onClick={handleTrackBookings}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Upcoming Activity */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ash-900">Upcoming Activity</h2>
            <div className="space-y-3">
              {trip.startDate && (
                <ActivityItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="Trip starts"
                  date={trip.startDate}
                  timezone={trip.timezone || undefined}
                />
              )}
              {trip.endDate && (
                <ActivityItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="Trip ends"
                  date={trip.endDate}
                  timezone={trip.timezone || undefined}
                />
              )}
              {!trip.startDate && !trip.endDate && (
                <p className="text-sm text-ash-500">No upcoming activities</p>
              )}
            </div>
          </div>
        </Card>

        {/* Past Activity */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ash-900">Past Activity</h2>
            <ActivityFeed tripId={trip.id} limit={5} showLoadMore={false} />
          </div>
        </Card>
      </div>

      {/* Right Sidebar */}
      <div className="space-y-6">
        {/* Travelers Card */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ash-900">Travelers</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditTravelersDialog(true)}
              >
                Manage Travelers
              </Button>
            </div>
          {loadingTravelers ? (
            <div className="text-center py-8">
              <p className="text-sm text-ash-500">Loading travelers...</p>
            </div>
          ) : travelers.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-12 w-12 text-ash-300 mx-auto mb-3" />
              <p className="text-sm text-ash-900 mb-1">No travelers added to this trip</p>
              <p className="text-sm text-ash-500 mb-4">Add a traveler to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {travelers.map((traveler) => {
                const name = getTravelerName(traveler)
                const initials = getInitials(name)
                const isExpanded = expandedTravelers.has(traveler.id)
                return (
                  <div key={traveler.id} className="border border-ash-200 rounded-lg overflow-hidden">
                    {/* Traveler Header - Always Visible */}
                    <button
                      onClick={() => toggleTraveler(traveler.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-ash-50 transition-colors"
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className={`${getAvatarColor(traveler.id)} text-white text-sm font-medium`}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        {traveler.contactId ? (
                          <Link
                            href={`/contacts/${traveler.contactId}`}
                            target="_blank"
                            className="text-sm font-semibold text-ash-900 truncate block hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {name}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-ash-900 truncate">{name}</p>
                        )}
                        {!isExpanded && (
                          <p className="text-xs text-ash-500">No details</p>
                        )}
                      </div>
                      <Badge
                        variant={getRoleBadgeVariant(traveler.role)}
                        className="text-xs flex-shrink-0"
                      >
                        {getRoleLabel(traveler.role) === 'Primary Contact' ? 'Primary' : getRoleLabel(traveler.role)}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-ash-500 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-ash-500 flex-shrink-0" />
                      )}
                    </button>

                    {/* Traveler Details - Expandable */}
                    {isExpanded && (
                      <div className="border-t border-ash-200 bg-ash-50 p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-ash-500 mb-1">Type</p>
                            <p className="text-ash-900 capitalize">{traveler.travelerType}</p>
                          </div>
                          {(traveler.contact?.email || traveler.contactSnapshot?.email) && (
                            <div>
                              <p className="text-xs text-ash-500 mb-1">Email</p>
                              <p className="text-ash-900 truncate">
                                {traveler.contact?.email || traveler.contactSnapshot?.email}
                              </p>
                            </div>
                          )}
                          {(traveler.contact?.phone || traveler.contactSnapshot?.phone) && (
                            <div>
                              <p className="text-xs text-ash-500 mb-1">Phone</p>
                              <p className="text-ash-900">
                                {traveler.contact?.phone || traveler.contactSnapshot?.phone}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </Card>

        {/* Itinerary Card */}
        <div className={cn(ITINERARY_CARD_STYLES, 'p-4')}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ash-900">Itinerary</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8', FOCUS_VISIBLE_RING)}
                onClick={() => setShowCreateItineraryDialog(true)}
                aria-label="Create new itinerary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Loading State */}
            {loadingItineraries && (
              <div className="space-y-2" role="status" aria-label="Loading itineraries">
                <div className={cn('h-10 rounded animate-pulse', SKELETON_BG)} />
                <div className={cn('h-10 rounded animate-pulse', SKELETON_BG)} />
              </div>
            )}

            {/* Error State */}
            {itinerariesError && !loadingItineraries && (
              <div className="text-center py-4">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-ash-600 mb-2">Failed to load itineraries</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchItineraries()}
                  className={FOCUS_VISIBLE_RING}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!loadingItineraries && !itinerariesError && (!itineraries || itineraries.length === 0) && (
              <div className="text-center py-4">
                <Calendar className="h-8 w-8 text-ash-300 mx-auto mb-2" />
                <p className="text-sm text-ash-600 mb-3">Create your first itinerary</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowCreateItineraryDialog(true)}
                  className={cn('bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white', FOCUS_VISIBLE_RING)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create Itinerary
                </Button>
              </div>
            )}

            {/* Itinerary List */}
            {!loadingItineraries && !itinerariesError && itineraries && itineraries.length > 0 && (
              <div className="space-y-2">
                {itineraries.map((itinerary) => (
                  <ItineraryListItem
                    key={itinerary.id}
                    itinerary={itinerary}
                    trip={trip}
                    onNavigate={() => router.replace(`/trips/${trip.id}?tab=itinerary`, { scroll: false })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trip Settings */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold text-ash-900">Trip Settings</h3>
          <div className="space-y-4">
            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-medium text-ash-900">
                Currency
              </Label>
              <Select
                value={trip.currency}
                onValueChange={(value) => handleUpdateSetting('currency', value)}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">United States Dollar (USD)</SelectItem>
                  <SelectItem value="CAD">Canadian Dollar (CAD)</SelectItem>
                  <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                  <SelectItem value="AUD">Australian Dollar (AUD)</SelectItem>
                  <SelectItem value="JPY">Japanese Yen (JPY)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pricing Visibility */}
            <div className="space-y-2">
              <Label htmlFor="pricing-visibility" className="text-sm font-medium text-ash-900">
                Pricing visibility
              </Label>
              <Select
                value={trip.pricingVisibility}
                onValueChange={(value) => handleUpdateSetting('pricingVisibility', value as any)}
              >
                <SelectTrigger id="pricing-visibility">
                  <SelectValue placeholder="Select visibility..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="show_all">Show all prices</SelectItem>
                  <SelectItem value="hide_all">Hide all prices</SelectItem>
                  <SelectItem value="travelers_only">Show to travelers only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-ash-900">Tags</Label>
              <TagInput
                value={tripTags}
                onChange={(tagIds) => {
                  updateTripTags.mutate({ tripId: trip.id, tagIds })
                }}
                onCreateTag={async (name) => {
                  const result = await createAndAssignTag.mutateAsync({
                    tripId: trip.id,
                    data: { name },
                  })
                  return result
                }}
                placeholder="Add tag..."
              />
            </div>

            {/* Allow PDF Downloads */}
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="allow-pdf" className="text-sm font-medium text-ash-900 cursor-pointer">
                Allow PDF Downloads
              </Label>
              <Switch
                id="allow-pdf"
                checked={trip.allowPdfDownloads}
                onCheckedChange={(checked) => handleUpdateSetting('allowPdfDownloads', checked)}
              />
            </div>

            {/* Itinerary Style - Hidden (will be controlled via buttons in Itinerary page) */}
            {/* Database field preserved for future use */}

            {/* Timezone - Hidden (will be per-activity when itinerary builder is implemented) */}
            {/* Database field preserved, DateDisplay falls back to browser timezone */}
            </div>
          </div>
        </Card>
      </div>

      {/* Edit Travelers Dialog */}
      <EditTravelersDialog
        open={showEditTravelersDialog}
        onOpenChange={setShowEditTravelersDialog}
        trip={trip}
      />

      {/* Create Itinerary Dialog */}
      <CreateItineraryDialog
        tripId={trip.id}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
        open={showCreateItineraryDialog}
        onOpenChange={setShowCreateItineraryDialog}
        onSuccess={() => {
          // Navigate to the itinerary tab after creation
          router.push(`/trips/${trip.id}?tab=itinerary`)
        }}
      />
    </div>
  )
}

// Helper functions for traveler display
function getTravelerName(traveler: any) {
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

function getInitials(name: string) {
  const parts = name.split(' ')
  const lastPart = parts[parts.length - 1]
  if (parts.length >= 2 && parts[0]?.[0] && lastPart?.[0]) {
    return `${parts[0][0]}${lastPart[0]}`.toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

// Color palette for traveler avatars - all meet WCAG AA contrast with white text
const AVATAR_COLORS = [
  'bg-teal-600',
  'bg-blue-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-amber-700',    // 700 for better contrast with white
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-cyan-700',     // 700 for better contrast with white
]

// Generate a consistent color based on a string (traveler ID or name)
function getAvatarColor(identifier: string): string {
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? 'bg-teal-600'
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'primary_contact':
      return 'default'
    case 'full_access':
      return 'secondary'
    case 'limited_access':
      return 'outline'
    default:
      return 'outline'
  }
}

function getRoleLabel(role: string) {
  switch (role) {
    case 'primary_contact':
      return 'Primary Contact'
    case 'full_access':
      return 'Full Access'
    case 'limited_access':
      return 'Limited Access'
    default:
      return role
  }
}

// Quick action card component with engaging hover effects
function QuickActionCard({
  icon,
  title,
  description,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center text-center p-4 gap-1 rounded-lg hover:bg-ash-50 transition-all duration-200 ease-in-out group hover:-translate-y-1 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-none"
    >
      <div className="mb-2 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">{icon}</div>
      <h4 className="text-sm font-medium text-ash-900 group-hover:text-phoenix-gold-600 transition-colors">
        {title}
      </h4>
      <p className="text-xs text-ash-500">{description}</p>
    </button>
  )
}

// Activity item component with contained icons
function ActivityItem({
  icon,
  label,
  date,
  timezone,
}: {
  icon: React.ReactNode
  label: string
  date: string
  timezone?: string
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ash-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="bg-slate-100 rounded-full p-2 text-ash-500">
          {icon}
        </div>
        <span className="text-sm text-ash-900">{label}</span>
      </div>
      <DateDisplay
        date={date}
        timezone={timezone}
        className="text-sm text-ash-500"
      />
    </div>
  )
}

// Setting item component (reserved for future settings panel)
// @ts-expect-error Reserved for future settings panel
function _SettingItem({
  label,
  value,
  placeholder = false,
}: {
  label: string
  value: string
  placeholder?: boolean
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ash-900 block mb-2">
        {label}
      </label>
      <div className={`text-sm px-3 py-2 rounded-md border border-ash-200 ${placeholder ? 'text-ash-400' : 'text-ash-900'}`}>
        {value}
      </div>
    </div>
  )
}

// Itinerary list item component with status badge and selection indicator
function ItineraryListItem({
  itinerary,
  trip,
  onNavigate,
}: {
  itinerary: ItineraryResponseDto
  trip: TripResponseDto
  onNavigate: () => void
}) {
  // Determine dates - prefer itinerary dates, fallback to trip dates
  const startDate = itinerary.startDate || trip.startDate
  const endDate = itinerary.endDate || trip.endDate

  // Get overview text - trim and cap for display
  const overviewText = itinerary.overview?.trim() || itinerary.description?.trim() || null


  // Get status badge variant - show workflow status
  // Approved status implies isSelected=true (enforced by backend)
  const getStatusBadge = () => {
    switch (itinerary.status) {
      case 'draft':
        return <Badge variant="inbound">Draft</Badge>
      case 'proposing':
        return <Badge variant="planning">Proposing</Badge>
      case 'approved':
        return (
          <Badge variant="completed" className="gap-1">
            <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
            <span>Approved</span>
          </Badge>
        )
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>
      default:
        return <Badge variant="secondary">{itinerary.status}</Badge>
    }
  }

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        'w-full text-left p-3 rounded-lg border border-ash-200 transition-all',
        'hover:border-phoenix-gold-400 hover:bg-phoenix-gold-50',
        FOCUS_VISIBLE_RING,
        itinerary.isSelected && 'border-phoenix-gold-500 bg-phoenix-gold-50/50'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-medium text-sm text-ash-900">{itinerary.name}</span>
        {getStatusBadge()}
      </div>

      {/* Dates */}
      {startDate && endDate && (
        <p className="text-xs text-ash-600 mb-1">
          <DateDisplay date={startDate} timezone={trip.timezone || undefined} /> –{' '}
          <DateDisplay date={endDate} timezone={trip.timezone || undefined} />
        </p>
      )}

      {/* Overview text with line-clamp */}
      {overviewText ? (
        <p className="text-xs text-ash-500 line-clamp-2">{overviewText}</p>
      ) : (
        <p className="text-xs text-ash-400 italic">No overview</p>
      )}

    </button>
  )
}
