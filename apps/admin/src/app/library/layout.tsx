'use client'

import { Ship, CalendarClock, Map, Package, MapPin, Building2, Mail } from 'lucide-react'
import { TernDetailLayout } from '@/components/tern/layout/tern-detail-layout'
import type { SidebarSection } from '@/components/tern/layout/tern-detail-sidebar'

const librarySections: SidebarSection[] = [
  {
    title: 'Travel Activities',
    items: [
      {
        name: 'Itinerary Templates',
        href: '/library/itineraries',
        icon: Map,
      },
      {
        name: 'Package Templates',
        href: '/library/packages',
        icon: Package,
      },
      {
        name: 'Cruises',
        href: '/library/cruises',
        icon: Ship,
      },
      {
        name: 'Tours',
        href: '/library/tours',
        icon: MapPin,
      },
    ],
  },
  {
    title: 'Trip Components',
    items: [
      {
        name: 'Suppliers',
        href: '/library/suppliers',
        icon: Building2,
      },
      {
        name: 'Payment Schedules',
        href: '/library/payment-schedules',
        icon: CalendarClock,
      },
    ],
  },
  {
    title: 'Communications',
    items: [
      {
        name: 'Email Templates',
        href: '/library/notifications',
        icon: Mail,
      },
    ],
  },
]

interface LibraryLayoutProps {
  children: React.ReactNode
}

export default function LibraryLayout({ children }: LibraryLayoutProps) {
  return (
    <TernDetailLayout
      backHref="/dashboard"
      backLabel="Dashboard"
      sidebarSections={librarySections}
    >
      {children}
    </TernDetailLayout>
  )
}
