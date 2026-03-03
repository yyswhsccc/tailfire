/**
 * Document Render Service
 *
 * Queue management for PDF rendering jobs.
 * Provides methods to enqueue render jobs and check their status.
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { JobProgress } from 'bullmq'
import { QUEUES, JOB_TYPES } from '../automation/automation.types'
import type { DocumentRenderJobData } from '../automation/automation.types'

@Injectable()
export class DocumentRenderService {
  private readonly logger = new Logger(DocumentRenderService.name)

  constructor(
    @InjectQueue(QUEUES.DOCUMENT_RENDER) private readonly renderQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Queue a PDF render job
  // ---------------------------------------------------------------------------

  async queuePdfRender(data: DocumentRenderJobData): Promise<string> {
    const jobId = `render-${data.templateSlug}-${Date.now()}`

    const job = await this.renderQueue.add(
      JOB_TYPES.DOCUMENT_RENDER_PDF,
      data,
      {
        jobId,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    )

    this.logger.log({
      message: 'PDF render job queued',
      jobId: job.id,
      templateSlug: data.templateSlug,
    })

    return job.id!
  }

  // ---------------------------------------------------------------------------
  // Check job status
  // ---------------------------------------------------------------------------

  async getJobStatus(jobId: string): Promise<{
    id: string
    state: string
    progress: JobProgress
    result: unknown
    failedReason: string | undefined
  } | null> {
    const job = await this.renderQueue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()

    return {
      id: job.id!,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    }
  }
}
