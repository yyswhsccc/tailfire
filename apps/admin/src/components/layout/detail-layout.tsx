'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { TopNav } from './top-nav'
import { DetailSidebar, type SidebarSection, type BackLink } from './detail-sidebar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface DetailLayoutProps {
  children: React.ReactNode
  backHref: string
  backLabel: string
  additionalBackLinks?: BackLink[]
  sidebarSections: SidebarSection[]
}

export function DetailLayout({
  children,
  backHref,
  backLabel,
  additionalBackLinks,
  sidebarSections,
}: DetailLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      <TopNav />
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:flex md:h-full">
          <DetailSidebar
            backHref={backHref}
            backLabel={backLabel}
            additionalBackLinks={additionalBackLinks}
            sections={sidebarSections}
          />
        </div>

        {/* Mobile navigation drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-phoenix-gold-600 text-white shadow-lg hover:bg-phoenix-gold-700 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <DetailSidebar
              backHref={backHref}
              backLabel={backLabel}
              additionalBackLinks={additionalBackLinks}
              sections={sidebarSections}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  )
}
