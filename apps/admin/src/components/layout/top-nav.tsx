'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, HelpCircle, Settings, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useAuth } from '@/providers/auth-provider'
import { UserAvatar } from '@/components/user/user-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMyProfile } from '@/hooks/use-user-profile'
import { NotificationBell } from '@/components/notifications'
import { CalendarNavbarPopover } from '@/components/calendar'
import { useUnreadEmailCount } from '@/hooks/use-emails'
import { BugReportDialog } from '@/components/bug-report/bug-report-dialog'

const navigation = [
  { name: 'Trips', href: '/trips' },
  { name: 'Tasks', href: '/tasks' },
  { name: 'Library', href: '/library' },
  { name: 'Emails', href: '/emails' },
  { name: 'Contacts', href: '/contacts' },
  { name: 'Commission', href: '/commission' },
  { name: 'Reporting', href: '/reporting' },
]

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout: clearStore } = useAuthStore()
  const { signOut, claims } = useAuth()
  const { data: profile } = useMyProfile()
  const isAdmin = claims?.role === 'admin'
  const unreadEmailCount = useUnreadEmailCount()
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [autoScreenshot, setAutoScreenshot] = useState<Blob | null>(null)

  const handleReportBug = async () => {
    try {
      // Wait one frame for dropdown overlay to unmount
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

      // Capture screenshot with timeout
      const html2canvas = (await import('html2canvas')).default
      const capturePromise = html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
      })

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 3000)
      )

      const canvas = await Promise.race([capturePromise, timeoutPromise])
      if (canvas) {
        const blob = await new Promise<Blob | null>((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(resolve, 'image/png')
        )
        setAutoScreenshot(blob)
      }
    } catch {
      // Screenshot capture failed — open dialog without it
    }

    setBugReportOpen(true)
  }

  const handleSignOut = async () => {
    try {
      await signOut() // Clear Supabase session + cookies
    } catch (error) {
      console.error('Sign out error:', error)
      // Continue anyway - clear local state and redirect
    }
    clearStore() // Clear Zustand local state
    router.push('/auth/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ash-200 bg-white">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Tailfire"
            width={32}
            height={32}
            className="h-8 w-8"
          />
        </Link>

        {/* Main Navigation */}
        <nav className="flex items-center space-x-1">
          {navigation.map((item) => {
            const isActive = pathname?.startsWith(item.href)
            const badge = item.name === 'Emails' && unreadEmailCount > 0 ? unreadEmailCount : 0
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'relative px-3 py-2 text-sm font-medium transition-colors hover:text-ash-900',
                  isActive
                    ? 'text-phoenix-gold-600'
                    : 'text-ash-600'
                )}
              >
                {item.name}
                {badge > 0 && (
                  <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-phoenix-gold-600" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-64 justify-start text-sm text-ash-500 border-ash-200"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-ash-200 bg-ash-50 px-1.5 font-mono text-[10px] font-medium text-ash-600">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          {/* Calendar Icon with Today's Events Popover */}
          <CalendarNavbarPopover />

          {/* Notifications */}
          <NotificationBell />

          {/* Help Icon */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <HelpCircle className="h-4 w-4 text-ash-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Help</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Documentation</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuItem>Keyboard Shortcuts</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleReportBug}>
                <Bug className="mr-2 h-4 w-4" />
                Report a Bug
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <UserAvatar
                  firstName={profile?.firstName}
                  lastName={profile?.lastName}
                  avatarUrl={profile?.avatarUrl}
                  size="sm"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {profile?.firstName && profile?.lastName
                      ? `${profile.firstName} ${profile.lastName}`
                      : user?.name || 'User'}
                  </p>
                  <p className="text-xs text-ash-500">{profile?.email || user?.email || ''}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <BugReportDialog
        open={bugReportOpen}
        onOpenChange={(open) => {
          setBugReportOpen(open)
          if (!open) setAutoScreenshot(null)
        }}
        autoScreenshot={autoScreenshot}
      />
    </header>
  )
}
