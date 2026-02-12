/**
 * Automation Queue React Query Hooks
 *
 * Provides hooks for managing the BullMQ automation system:
 * - Queue status (waiting, active, completed, failed counts)
 * - Delayed jobs listing
 * - Job management (cancel, schedule)
 * - Backfill operations
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface QueueCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface QueueCountsWithName extends QueueCounts {
  name: string
}

export interface QueuesResponse {
  queues: Record<string, QueueCounts>
  timestamp: string
}

/**
 * Transform the API response (object) to an array with names
 */
export function transformQueuesResponse(data: QueuesResponse): QueueCountsWithName[] {
  return Object.entries(data.queues).map(([name, counts]) => ({
    name,
    ...counts,
  }))
}

export interface DelayedJob {
  id: string
  name: string
  status: string
  data?: Record<string, unknown>
  progress?: number
  failedReason?: string
  processedOn?: number
  finishedOn?: number
  timestamp?: number
  delay?: number
}

export interface DelayedJobsResponse {
  queue: string
  jobs: DelayedJob[]
  count: number
}

export interface JobStatus {
  found: boolean
  jobId: string
  state?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'
  data?: Record<string, unknown>
  progress?: number
  attemptsMade?: number
  finishedOn?: number
  processedOn?: number
  failedReason?: string
}

export interface ScheduleJobParams {
  queue: 'trip-automation' | 'client-care' | 'notifications'
  jobType: string
  data: Record<string, unknown>
  delay?: number
  runAt?: string
  jobId?: string
}

export interface ScheduleJobResponse {
  jobId: string
  queue: string
  jobType: string
  scheduled: boolean
}

export interface BackfillResponse {
  jobId: string
  message: string
  batchSize: number
}

export interface CancelResponse {
  jobId: string
  cancelled: boolean
}

export interface CancelPatternResponse {
  queue: string
  pattern: string
  cancelled: number
}

// ============================================================================
// Query Keys
// ============================================================================

export const automationKeys = {
  all: ['automation'] as const,
  queues: () => [...automationKeys.all, 'queues'] as const,
  delayedJobs: (queue: string) => [...automationKeys.all, 'delayed', queue] as const,
  job: (jobId: string) => [...automationKeys.all, 'job', jobId] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all queue counts. Polls every 5 seconds by default.
 */
export function useQueueCounts(
  options?: Omit<UseQueryOptions<QueuesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: automationKeys.queues(),
    queryFn: async () => {
      return api.get<QueuesResponse>('/admin/automation/queues')
    },
    refetchInterval: 5000, // Poll every 5 seconds
    ...options,
  })
}

/**
 * Get delayed jobs for a specific queue.
 */
export function useDelayedJobs(
  queue: string,
  start = 0,
  end = 100,
  options?: Omit<UseQueryOptions<DelayedJobsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: automationKeys.delayedJobs(queue),
    queryFn: async () => {
      return api.get<DelayedJobsResponse>(
        `/admin/automation/queues/${queue}/delayed?start=${start}&end=${end}`
      )
    },
    staleTime: 10_000, // 10 seconds
    ...options,
  })
}

/**
 * Get job status by ID.
 */
export function useJobStatus(
  jobId: string,
  queue?: string,
  options?: Omit<UseQueryOptions<JobStatus>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: automationKeys.job(jobId),
    queryFn: async () => {
      const queryParams = queue ? `?queue=${queue}` : ''
      return api.get<JobStatus>(`/admin/automation/jobs/${jobId}${queryParams}`)
    },
    enabled: !!jobId,
    ...options,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Schedule a new job.
 */
export function useScheduleJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: ScheduleJobParams) => {
      return api.post<ScheduleJobResponse>('/admin/automation/jobs/schedule', params)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}

/**
 * Cancel a job by ID.
 */
export function useCancelJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ jobId, queue }: { jobId: string; queue?: string }) => {
      const queryParams = queue ? `?queue=${queue}` : ''
      return api.delete<CancelResponse>(`/admin/automation/jobs/${jobId}${queryParams}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}

/**
 * Cancel jobs matching a pattern.
 */
export function useCancelPattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { queue: string; pattern: string }) => {
      return api.delete<CancelPatternResponse>('/admin/automation/jobs/pattern', {
        body: JSON.stringify(params),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}

/**
 * Trigger trip backfill operation.
 */
export function useTriggerBackfill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (batchSize: number = 100) => {
      return api.post<BackfillResponse>('/admin/automation/trips/backfill', { batchSize })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}
