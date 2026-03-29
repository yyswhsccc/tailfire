'use client'

import { Ship, CalendarClock, Map, Package, MapPin, Building2, Award, Tag, FileText, Palmtree } from 'lucide-react'
import { DetailLayout } from '@/components/layout/detail-layout'
import type { SidebarSection } from '@/components/layout/detail-sidebar'

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
        name: 'Vacation Packages',
        href: '/library/vacation',
        icon: Palmtree,
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
        name: 'Loyalty Programs',
        href: '/library/loyalty-programs',
        icon: Award,
      },
      {
        name: 'Payment Schedules',
        href: '/library/payment-schedules',
        icon: CalendarClock,
      },
    ],
  },
  {
    title: 'Organization',
    items: [
      {
        name: 'Tags',
        href: '/library/tags',
        icon: Tag,
      },
    ],
  },
  {
    title: 'Communications',
    items: [
      {
        name: 'Templates',
        href: '/library/templates',
        icon: FileText,
      },
    ],
  },
]

interface LibraryLayoutProps {
  children: React.ReactNode
}

export default function LibraryLayout({ children }: LibraryLayoutProps) {
  return (
    <DetailLayout
      backHref="/dashboard"
      backLabel="Dashboard"
      sidebarSections={librarySections}
    >
      {children}
    </DetailLayout>
  )
}
