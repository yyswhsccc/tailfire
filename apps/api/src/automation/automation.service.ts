/**
 * Automation Service
 *
 * Central scheduling API for the automation system.
 * Provides a unified interface for scheduling, canceling, and managing jobs.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue, Job } from 'bullmq'
import { TZDate } from '@date-fns/tz'
import { startOfDay, addDays, isBefore, isAfter } from 'date-fns'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import {
  QUEUES,
  type QueueName,
  type ScheduleOptions,
  type JobStatus,
  type JobStatusInfo,
} from './automation.types'

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger(AutomationService.name)
  private readonly queues: Map<string, Queue> = new Map()

  constructor(
    @InjectQueue(QUEUES.TRIP_AUTOMATION) private readonly tripAutomationQueue: Queue,
    @InjectQueue(QUEUES.CLIENT_CARE) private readonly clientCareQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUES.ENRICHMENT) private readonly enrichmentQueue: Queue,
    private readonly db: DatabaseService,
  ) {
    this.queues.set(QUEUES.TRIP_AUTOMATION, this.tripAutomationQueue)
    this.queues.set(QUEUES.CLIENT_CARE, this.clientCareQueue)
    this.queues.set(QUEUES.NOTIFICATIONS, this.notificationsQueue)
    this.queues.set(QUEUES.ENRICHMENT, this.enrichmentQueue)
  }

  async onModuleInit() {
    this.logger.log('AutomationService initialized')
    this.logger.log(`Registered queues: ${Array.from(this.queues.keys()).join(', ')}`)

    // Initialize recurring jobs
    await this.initializeRecurringJobs()
  }

  /**
   * Initialize recurring jobs on module startup
   * Runs daily checks for birthdays and overdue payments
   */
  private async initializeRecurringJobs(): Promise<void> {
    try {
      // Daily birthday check at 8 AM Toronto time
      await this.scheduleRecurring(
        QUEUES.CLIENT_CARE,
        'recurring.birthday_check',
        { type: 'recurring.birthday_check' },
        '0 8 * * *', // 8 AM daily
        { jobId: 'recurring:birthday_check' },
      )
      this.logger.log('Scheduled recurring birthday check job')

      // Daily overdue payment scan at 9 AM Toronto time
      await this.scheduleRecurring(
        QUEUES.CLIENT_CARE,
        'recurring.overdue_payment_scan',
        { type: 'recurring.overdue_payment_scan' },
        '0 9 * * *', // 9 AM daily
        { jobId: 'recurring:overdue_payment_scan' },
      )
      this.logger.log('Scheduled recurring overdue payment scan job')

      // Hourly task assignment digest for contacts
      await this.scheduleRecurring(
        QUEUES.CLIENT_CARE,
        'recurring.task_assignment_digest',
        { type: 'recurring.task_assignment_digest' },
        '0 * * * *', // Every hour
        { jobId: 'recurring:task_assignment_digest' },
      )
      this.logger.log('Scheduled recurring task assignment digest job')

      // Hourly task due reminder check (sends 24h before due date)
      await this.scheduleRecurring(
        QUEUES.CLIENT_CARE,
        'recurring.task_due_reminder',
        { type: 'recurring.task_due_reminder' },
        '0 * * * *', // Every hour
        { jobId: 'recurring:task_due_reminder' },
      )
      this.logger.log('Scheduled recurring task due reminder job')

      // Contact lifecycle: returned → awaiting_next after 30 days
      await this.scheduleRecurring(
        QUEUES.CLIENT_CARE,
        'contact-lifecycle-daily',
        { type: 'contact-lifecycle-daily' },
        '0 7 * * *', // 7 AM daily (before birthday/payment checks)
        { jobId: 'recurring:contact_lifecycle_daily' },
      )
      this.logger.log('Scheduled recurring contact lifecycle daily job')
    } catch (error) {
      this.logger.error(`Failed to initialize recurring jobs: ${error}`)
      // Don't throw - allow service to start even if recurring jobs fail to initialize
    }
  }

  // ============================================================================
  // Scheduling Methods
  // ============================================================================

  /**
   * Schedule a job to run after a delay
   *
   * @param queue - Queue name
   * @param jobType - Job type identifier
   * @param data - Job data payload
   * @param options - Scheduling options
   * @returns Job ID
   */
  async schedule(
    queue: QueueName,
    jobType: string,
    data: Record<string, unknown>,
    options?: ScheduleOptions,
  ): Promise<string> {
    const targetQueue = this.queues.get(queue)
    if (!targetQueue) {
      throw new Error(`Queue "${queue}" not found`)
    }

    const jobOptions: Record<string, unknown> = {
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff ?? {
        type: 'exponential',
        delay: 1000, // 1s, 5s, 30s
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    }

    if (options?.delay) {
      jobOptions.delay = options.delay
    }

    if (options?.priority) {
      jobOptions.priority = options.priority
    }

    // Generate or use provided job ID
    const jobId = options?.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    jobOptions.jobId = jobId

    // Log to job history table FIRST to ensure row exists before job processes
    await this.logJobCreation(queue, jobId, jobType, data, options)

    const job = await targetQueue.add(jobType, { ...data, type: jobType }, jobOptions)

    this.logger.log(`Scheduled job ${job.id} on queue ${queue} (type: ${jobType})`)

    return job.id ?? jobId
  }

  /**
   * Schedule a job to run at a specific datetime
   *
   * @param queue - Queue name
   * @param jobType - Job type identifier
   * @param data - Job data payload
   * @param runAt - DateTime when job should run
   * @param options - Additional scheduling options
   * @returns Job ID
   */
  async scheduleAt(
    queue: QueueName,
    jobType: string,
    data: Record<string, unknown>,
    runAt: Date,
    options?: Omit<ScheduleOptions, 'delay'>,
  ): Promise<string> {
    const now = new Date()
    const delay = Math.max(0, runAt.getTime() - now.getTime())

    return this.schedule(queue, jobType, data, {
      ...options,
      delay,
    })
  }

  /**
   * Schedule a recurring job using cron pattern
   *
   * @param queue - Queue name
   * @param jobType - Job type identifier
   * @param data - Job data payload
   * @param cronPattern - Cron expression
   * @param options - Additional scheduling options
   * @param timezone - IANA timezone for cron schedule (default: America/Toronto)
   * @returns Job ID
   */
  async scheduleRecurring(
    queue: QueueName,
    jobType: string,
    data: Record<string, unknown>,
    cronPattern: string,
    options?: ScheduleOptions,
    timezone: string = 'America/Toronto',
  ): Promise<string> {
    const targetQueue = this.queues.get(queue)
    if (!targetQueue) {
      throw new Error(`Queue "${queue}" not found`)
    }

    // For recurring jobs, we use a repeatable job with timezone support
    const jobOptions: Record<string, unknown> = {
      repeat: {
        pattern: cronPattern,
        tz: timezone, // BullMQ timezone support
      },
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff ?? {
        type: 'exponential',
        delay: 1000,
      },
    }

    if (options?.jobId) {
      jobOptions.jobId = options.jobId
    }

    const job = await targetQueue.add(jobType, { ...data, type: jobType }, jobOptions)

    this.logger.log(`Scheduled recurring job ${job.id} on queue ${queue} (cron: ${cronPattern}, tz: ${timezone})`)

    return job.id ?? 'unknown'
  }

  // ============================================================================
  // Cancellation Methods
  // ============================================================================

  /**
   * Cancel a scheduled job by ID
   *
   * @param jobId - Job ID to cancel
   * @param queue - Optional queue name to search in
   * @returns True if job was found and removed
   */
  async cancel(jobId: string, queue?: QueueName): Promise<boolean> {
    const queuesToSearch = queue ? [this.queues.get(queue)!] : Array.from(this.queues.values())

    for (const targetQueue of queuesToSearch) {
      if (!targetQueue) continue

      try {
        const job = await targetQueue.getJob(jobId)
        if (job) {
          const state = await job.getState()
          // Only remove if job is waiting or delayed
          if (state === 'waiting' || state === 'delayed') {
            await job.remove()
            this.logger.log(`Cancelled job ${jobId} from queue ${targetQueue.name}`)
            return true
          } else {
            this.logger.warn(`Cannot cancel job ${jobId} - currently ${state}`)
            return false
          }
        }
      } catch {
        // Job not found in this queue, continue searching
        continue
      }
    }

    this.logger.debug(`Job ${jobId} not found in any queue`)
    return false
  }

  /**
   * Cancel all jobs matching a pattern
   *
   * @param pattern - Job ID pattern (supports wildcards)
   * @param queue - Queue to search
   * @returns Number of jobs cancelled
   */
  async cancelPattern(pattern: string, queue: QueueName): Promise<number> {
    const targetQueue = this.queues.get(queue)
    if (!targetQueue) {
      throw new Error(`Queue "${queue}" not found`)
    }

    let cancelled = 0

    // Get delayed jobs
    const delayedJobs = await targetQueue.getDelayed()
    for (const job of delayedJobs) {
      if (job.id && this.matchesPattern(job.id, pattern)) {
        await job.remove()
        cancelled++
      }
    }

    // Get waiting jobs
    const waitingJobs = await targetQueue.getWaiting()
    for (const job of waitingJobs) {
      if (job.id && this.matchesPattern(job.id, pattern)) {
        await job.remove()
        cancelled++
      }
    }

    this.logger.log(`Cancelled ${cancelled} jobs matching pattern "${pattern}" from ${queue}`)
    return cancelled
  }

  private matchesPattern(jobId: string, pattern: string): boolean {
    // Simple wildcard matching: * matches any characters
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(jobId)
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Get status of a specific job
   *
   * @param jobId - Job ID
   * @param queue - Optional queue name
   * @returns Job status info or null if not found
   */
  async getStatus(jobId: string, queue?: QueueName): Promise<JobStatusInfo | null> {
    const queuesToSearch = queue ? [this.queues.get(queue)!] : Array.from(this.queues.values())

    for (const targetQueue of queuesToSearch) {
      if (!targetQueue) continue

      try {
        const job = await targetQueue.getJob(jobId)
        if (job) {
          return this.mapJobToStatus(job)
        }
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Get counts for all queues
   */
  async getQueueCounts(): Promise<
    Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>
  > {
    const counts: Record<
      string,
      { waiting: number; active: number; completed: number; failed: number; delayed: number }
    > = {}

    for (const [name, queue] of this.queues) {
      const jobCounts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
      counts[name] = {
        waiting: jobCounts.waiting ?? 0,
        active: jobCounts.active ?? 0,
        completed: jobCounts.completed ?? 0,
        failed: jobCounts.failed ?? 0,
        delayed: jobCounts.delayed ?? 0,
      }
    }

    return counts
  }

  /**
   * Get delayed jobs for a queue
   */
  async getDelayedJobs(queue: QueueName, start = 0, end = 100): Promise<JobStatusInfo[]> {
    const targetQueue = this.queues.get(queue)
    if (!targetQueue) {
      throw new Error(`Queue "${queue}" not found`)
    }

    const jobs = await targetQueue.getDelayed(start, end)
    return Promise.all(jobs.map((job) => this.mapJobToStatus(job)))
  }

  private async mapJobToStatus(job: Job): Promise<JobStatusInfo> {
    const state = await job.getState()
    return {
      id: job.id ?? 'unknown',
      name: job.name,
      status: state as JobStatus,
      progress: job.progress as number | undefined,
      data: job.data as Record<string, unknown>,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      delay: job.delay,
    }
  }

  // ============================================================================
  // History Logging
  // ============================================================================

  private async logJobCreation(
    queueName: string,
    jobId: string,
    jobType: string,
    jobData: Record<string, unknown>,
    options?: ScheduleOptions,
  ): Promise<void> {
    try {
      // Calculate scheduled_for if delay is provided
      let scheduledFor: Date | null = null
      if (options?.delay) {
        scheduledFor = new Date(Date.now() + options.delay)
      }

      await this.db.client.insert(this.db.schema.automationJobHistory).values({
        queueName,
        jobId,
        jobType,
        jobData,
        status: 'queued',
        scheduledFor,
      })
    } catch (error) {
      // Non-blocking - log errors but don't fail the job creation
      this.logger.warn(`Failed to log job creation: ${error}`)
    }
  }

  /**
   * Update job history status
   * Called by processors on job start, completion, or failure
   *
   * @param queueName - Queue name to prevent cross-queue collisions
   * @param jobId - Job ID
   * @param status - New status
   * @param errorMessage - Error message for failed jobs
   */
  async updateJobHistory(
    queueName: string,
    jobId: string,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      const now = new Date()
      const updateData: Record<string, unknown> = { status }

      if (status === 'processing') {
        updateData.startedAt = now
      } else if (status === 'completed') {
        updateData.completedAt = now
      } else if (status === 'failed') {
        updateData.completedAt = now
        updateData.errorMessage = errorMessage
      }

      // Filter by both queueName AND jobId to prevent cross-queue collisions
      await this.db.client
        .update(this.db.schema.automationJobHistory)
        .set(updateData)
        .where(
          and(
            eq(this.db.schema.automationJobHistory.queueName, queueName),
            eq(this.db.schema.automationJobHistory.jobId, jobId),
          )
        )
    } catch (error) {
      // Non-blocking
      this.logger.warn(`Failed to update job history for ${queueName}/${jobId}: ${error}`)
    }
  }

  // ============================================================================
  // Timezone-Aware Scheduling Helpers
  // ============================================================================

  /**
   * Compute midnight in a specific timezone
   * Used for scheduling trip status transitions based on start/end dates
   *
   * @param dateStr - ISO date string (YYYY-MM-DD)
   * @param timezone - IANA timezone identifier (e.g., 'America/Toronto')
   * @returns Date object representing midnight in the specified timezone
   */
  computeLocalMidnight(dateStr: string, timezone?: string): Date {
    const tz = timezone || 'UTC'
    const tzDate = new TZDate(dateStr, tz)
    return startOfDay(tzDate)
  }

  /**
   * Compute the day after a date at midnight in a specific timezone
   * Used for scheduling completed status transition
   *
   * @param dateStr - ISO date string (YYYY-MM-DD)
   * @param timezone - IANA timezone identifier
   * @returns Date object representing midnight of the next day
   */
  computeDayAfterMidnight(dateStr: string, timezone?: string): Date {
    const midnight = this.computeLocalMidnight(dateStr, timezone)
    return addDays(midnight, 1)
  }

  /**
   * Check if a date is in the past
   */
  isInPast(date: Date): boolean {
    return isBefore(date, new Date())
  }

  /**
   * Check if a date is in the future
   */
  isInFuture(date: Date): boolean {
    return isAfter(date, new Date())
  }
}
