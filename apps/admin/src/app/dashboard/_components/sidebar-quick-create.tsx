'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plane, CheckSquare, UserPlus } from 'lucide-react'

const items = [
  { label: 'New Trip', href: '/trips/new', icon: Plane },
  { label: 'New Task', href: '/tasks', icon: CheckSquare },
  { label: 'New Contact', href: '/contacts/new', icon: UserPlus },
]

export function SidebarQuickCreate() {
  const router = useRouter()

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
            onClick={() => router.push(item.href)}
          >
            <item.icon className="h-4 w-4 mr-2" />
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
