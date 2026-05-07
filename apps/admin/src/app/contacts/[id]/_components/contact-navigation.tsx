import {
  Activity,
  CheckSquare,
  StickyNote,
  Mail,
  MessageCircle,
  Calendar,
  FileText,
  Plane,
  MapPin,
  CreditCard,
  Banknote,
  Users,
  Award,
  TrendingUp,
} from 'lucide-react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from '@/components/ui/menubar'

export type ContactSection =
  | 'timeline'
  | 'tasks'
  | 'notes'
  | 'emails'
  | 'sms'
  | 'messages'
  | 'calendar'
  | 'files'
  | 'relationships'
  | 'loyalty'
  | 'consumer-insights'
  | 'trips'
  | 'bookings'
  | 'payments'
  | 'trust'

interface ContactNavigationProps {
  activeSection: ContactSection
  onSectionChange: (section: ContactSection) => void
}

const navigationGroups = [
  {
    id: 'activity',
    label: 'Activity',
    items: [
      { id: 'timeline' as const, label: 'Timeline', icon: Activity },
      { id: 'tasks' as const, label: 'Tasks', icon: CheckSquare },
      { id: 'relationships' as const, label: 'Relationships', icon: Users },
      { id: 'loyalty' as const, label: 'Loyalty Programs', icon: Award },
      { id: 'consumer-insights' as const, label: 'Consumer Insights', icon: TrendingUp },
    ]
  },
  {
    id: 'communications',
    label: 'Communications',
    items: [
      { id: 'notes' as const, label: 'Notes', icon: StickyNote },
      { id: 'emails' as const, label: 'Emails', icon: Mail },
      { id: 'sms' as const, label: 'SMS', icon: MessageCircle },
      { id: 'messages' as const, label: 'Messages', icon: MessageCircle },
      { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
      { id: 'files' as const, label: 'Files', icon: FileText }
    ]
  },
  {
    id: 'trips',
    label: 'Trips',
    items: [
      { id: 'trips' as const, label: 'Trips', icon: Plane },
      { id: 'bookings' as const, label: 'Bookings', icon: MapPin },
      { id: 'payments' as const, label: 'Payments', icon: CreditCard },
      { id: 'trust' as const, label: 'Trust Account', icon: Banknote }
    ]
  }
]

export function ContactNavigation({ activeSection, onSectionChange }: ContactNavigationProps) {
  return (
    <Menubar className="border-none bg-transparent p-4">
      {navigationGroups.map((group) => (
        <MenubarMenu key={group.id}>
          <MenubarTrigger className="text-sm font-medium text-ash-700 hover:text-phoenix-gold-600 data-[state=open]:text-phoenix-gold-600">
            {group.label}
          </MenubarTrigger>
          <MenubarContent>
            {group.items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <MenubarSeparator />}
                <MenubarItem
                  onClick={() => onSectionChange(item.id)}
                  className={
                    activeSection === item.id
                      ? 'bg-phoenix-gold-50 text-phoenix-gold-700 font-medium'
                      : 'text-ash-700 hover:bg-ash-50'
                  }
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </MenubarItem>
              </div>
            ))}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}
