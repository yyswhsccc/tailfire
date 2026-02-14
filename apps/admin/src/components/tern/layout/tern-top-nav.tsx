'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, HelpCircle, Settings } from 'lucide-react'
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

const navigation = [
  { name: 'Trips', href: '/trips' },
  { name: 'Tasks', href: '/tasks' },
  { name: 'Library', href: '/library' },
  { name: 'Emails', href: '/emails' },
  { name: 'Contacts', href: '/contacts' },
  { name: 'Commission', href: '/commission' },
  { name: 'Reporting', href: '/reporting' },
]

export function TernTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout: clearStore } = useAuthStore()
  const { signOut, claims } = useAuth()
  const { data: profile } = useMyProfile()
  const isAdmin = claims?.role === 'admin'

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
    <header className="sticky top-0 z-50 w-full border-b border-tern-gray-200 bg-white">
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
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'relative px-3 py-2 text-sm font-medium transition-colors hover:text-tern-gray-900',
                  isActive
                    ? 'text-tern-teal-600'
                    : 'text-tern-gray-600'
                )}
              >
                {item.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-tern-teal-600" />
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
            className="h-8 w-64 justify-start text-sm text-tern-gray-500 border-tern-gray-200"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-tern-gray-200 bg-tern-gray-50 px-1.5 font-mono text-[10px] font-medium text-tern-gray-600">
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
                <HelpCircle className="h-4 w-4 text-tern-gray-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Help</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Documentation</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuItem>Keyboard Shortcuts</DropdownMenuItem>
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
                  <p className="text-xs text-tern-gray-500">{profile?.email || user?.email || ''}</p>
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
    </header>
  )
}
