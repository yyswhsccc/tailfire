'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Mail, Plane, CheckSquare, UserPlus } from 'lucide-react'
import { useEmailStore } from '@/stores/email.store'

type QuickCreateItem = {
  label: string
  icon: typeof Plane
  action: () => void
}

export function SidebarQuickCreate() {
  const router = useRouter()

  const items: QuickCreateItem[] = [
    { label: 'New Trip', icon: Plane, action: () => router.push('/trips?create=true') },
    { label: 'New Task', icon: CheckSquare, action: () => router.push('/tasks') },
    { label: 'New Contact', icon: UserPlus, action: () => router.push('/contacts?create=true') },
    {
      label: 'New Email',
      icon: Mail,
      action: () => {
        useEmailStore.setState({ compose: { mode: 'new' } })
        router.push('/emails/inbox')
      },
    },
  ]

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Quick Create
      </h4>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            size="sm"
            className="justify-start h-8"
            onClick={item.action}
          >
            <item.icon className="h-4 w-4 mr-2" />
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
