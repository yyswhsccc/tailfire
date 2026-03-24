export interface GuideTopic {
  id: string
  title: string
  description: string
  category:
    | 'getting-started'
    | 'trip-management'
    | 'booking-payments'
    | 'contacts-communication'
    | 'finances'
    | 'tools'
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'Your home base — KPIs, charts, tasks due',
    category: 'getting-started',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Work faster with shortcuts',
    category: 'getting-started',
  },
  {
    id: 'trips',
    title: 'Managing Trips',
    description: 'Create, search, organize trips',
    category: 'trip-management',
  },
  {
    id: 'trip-overview',
    title: 'Trip Overview',
    description: 'Status, travelers, dates, agents',
    category: 'trip-management',
  },
  {
    id: 'itineraries',
    title: 'Building Itineraries',
    description: 'Add activities, arrange days, proposals',
    category: 'trip-management',
  },
  {
    id: 'activity-forms',
    title: 'Activity Forms',
    description: 'Flights, hotels, cruises, tours, and more',
    category: 'trip-management',
  },
  {
    id: 'bookings',
    title: 'Booking Activities',
    description: 'Mark as booked, validation, packages',
    category: 'booking-payments',
  },
  {
    id: 'payments',
    title: 'Payment Schedules',
    description: 'Expected payments, recording transactions',
    category: 'booking-payments',
  },
  {
    id: 'insurance',
    title: 'Insurance Coverage',
    description: 'Proposals, waivers, tracking',
    category: 'booking-payments',
  },
  {
    id: 'service-fees',
    title: 'Service Fees',
    description: 'Agency fees and invoicing',
    category: 'booking-payments',
  },
  {
    id: 'contacts',
    title: 'Managing Contacts',
    description: 'Client profiles, travelers, documents',
    category: 'contacts-communication',
  },
  {
    id: 'emails',
    title: 'Email System',
    description: 'Send, sync, templates',
    category: 'contacts-communication',
  },
  {
    id: 'calendar',
    title: 'Calendar & Tasks',
    description: 'Events, reminders, deadlines',
    category: 'contacts-communication',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    description: 'Trip tasks, assignments, tracking',
    category: 'contacts-communication',
  },
  {
    id: 'commissions',
    title: 'Commission Tracking',
    description: 'Earned, received, overdue commissions',
    category: 'finances',
  },
  {
    id: 'reporting',
    title: 'Reports',
    description: 'Sales, financial, compliance reports',
    category: 'finances',
  },
  {
    id: 'library',
    title: 'Library & Templates',
    description: 'Itinerary and email templates',
    category: 'tools',
  },
  {
    id: 'tags',
    title: 'Tags & Organization',
    description: 'Categorize trips and contacts',
    category: 'tools',
  },
  {
    id: 'documents',
    title: 'Documents',
    description: 'Upload and manage trip documents',
    category: 'tools',
  },
]

export const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  'trip-management': 'Trip Management',
  'booking-payments': 'Booking & Payments',
  'contacts-communication': 'Contacts & Communication',
  finances: 'Finances',
  tools: 'Tools',
}

export function getTopicForRoute(
  pathname: string,
  tab?: string | null,
): string | null {
  // Trip detail tabs
  if (pathname.match(/\/trips\/[^/]+/) && !pathname.includes('/activities/')) {
    const tabMap: Record<string, string> = {
      itinerary: 'itineraries',
      bookings: 'bookings',
      payments: 'payments',
      insurance: 'insurance',
      'service-fees': 'service-fees',
      documents: 'documents',
      tasks: 'tasks',
    }
    if (tab && tabMap[tab]) return tabMap[tab]
    return 'trip-overview'
  }

  // Activity edit forms
  if (pathname.includes('/activities/') && pathname.includes('/edit'))
    return 'activity-forms'

  // Top-level routes
  const routeMap: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/trips': 'trips',
    '/contacts': 'contacts',
    '/commission': 'commissions',
    '/calendar': 'calendar',
    '/tasks': 'tasks',
    '/emails': 'emails',
    '/library': 'library',
    '/reporting': 'reporting',
  }

  for (const [route, topic] of Object.entries(routeMap)) {
    if (pathname === route || pathname.startsWith(route + '/')) return topic
  }

  return null
}
