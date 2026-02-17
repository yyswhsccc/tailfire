'use client'

import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { CalendarView } from './_components'
import { useUsers } from '@/hooks/use-users'
import { useUser } from '@/hooks/use-user'

/**
 * Calendar Page
 *
 * Full calendar view with multiple view modes (month, week, day, list)
 * Aggregates events from tasks, trips, payments, birthdays, and scheduled emails
 *
 * Features:
 * - View toggle (month/week/day/list)
 * - Event type filtering
 * - Admin user filtering
 * - Event click-through to details
 */
export default function CalendarPage() {
  const { isAdmin } = useUser()
  const { data: users } = useUsers()

  // Build user options for admin filter dropdown
  const userOptions = users?.users?.map((user) => ({
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown User',
  })) || []

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <PageHeader
          title="Calendar"
          description="View and manage your schedule"
        />

        <div className="flex-1 min-h-0 mt-4">
          <CalendarView userOptions={userOptions} isAdmin={isAdmin} />
        </div>
      </div>
    </DashboardLayout>
  )
}
