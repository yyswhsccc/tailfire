'use client'

import { useState } from 'react'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { QueueStatusCards } from './_components/queue-status-cards'
import { DelayedJobsTable } from './_components/delayed-jobs-table'
import { BackfillCard } from './_components/backfill-card'

export default function AutomationPage() {
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null)

  return (
    <SettingsTabsLayout activeTab="automation">
      {/* Page-specific header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold">Automation Queues</h3>
        <p className="text-sm text-muted-foreground">
          Monitor and manage scheduled jobs for trip automation, client care, and notifications
        </p>
      </div>

      <div className="space-y-6">
        {/* Queue Status Cards */}
        <QueueStatusCards onViewDelayed={setSelectedQueue} />

        {/* Delayed Jobs Table (when queue selected) */}
        {selectedQueue && (
          <DelayedJobsTable
            queueName={selectedQueue}
            onClose={() => setSelectedQueue(null)}
          />
        )}

        {/* Backfill Tools */}
        <BackfillCard />
      </div>
    </SettingsTabsLayout>
  )
}
