'use client'

import { Zap } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { AutomationJobCard } from './automation-job-card'
import {
  useTripAutomations,
  usePauseAutomation,
  useResumeAutomation,
  useCancelAutomation,
} from '@/hooks/use-automations'
import type { TripWithDetailsResponseDto } from '@tailfire/shared-types/api'

interface TripAutomationsProps {
  trip: TripWithDetailsResponseDto
}

export function TripAutomations({ trip }: TripAutomationsProps) {
  const { data: response, isLoading } = useTripAutomations(trip.id)
  const jobs = Array.isArray(response) ? response : (response as any)?.jobs ?? []
  const pauseJob = usePauseAutomation(trip.id)
  const resumeJob = useResumeAutomation(trip.id)
  const cancelJob = useCancelAutomation(trip.id)

  // Sort newest first
  const sortedJobs = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  if (isLoading) {
    return (
      <EmptyState
        title="Loading automation jobs..."
        description="Please wait while we fetch the automation history."
      />
    )
  }

  if (sortedJobs.length === 0) {
    return (
      <EmptyState
        icon={<Zap className="h-6 w-6" />}
        title="No automation jobs yet"
        description="Jobs will appear here when you initiate insurance proposals or other automated workflows."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ash-900">Automations</h2>
          <p className="text-sm text-ash-500">
            {sortedJobs.length} job{sortedJobs.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedJobs.map((job) => (
          <AutomationJobCard
            key={job.id}
            job={job}
            onPause={(jobId) => pauseJob.mutate(jobId)}
            onResume={(jobId) => resumeJob.mutate(jobId)}
            onCancel={(jobId) => cancelJob.mutate(jobId)}
            isPausing={pauseJob.isPending}
            isResuming={resumeJob.isPending}
            isCancelling={cancelJob.isPending}
          />
        ))}
      </div>
    </div>
  )
}
