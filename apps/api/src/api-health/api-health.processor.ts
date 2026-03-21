/**
 * API Health Processor
 *
 * BullMQ worker that processes health check jobs.
 * Handles three job types:
 * - check-all: Fan-out check of all configured providers
 * - check-provider: Single provider check (immediate or scheduled)
 * - cleanup: Delete checks older than 7 days
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ApiHealthService } from './api-health.service'

@Processor('api-health')
@Injectable()
export class ApiHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(ApiHealthProcessor.name)

  constructor(private readonly healthService: ApiHealthService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'check-all': {
        this.logger.log('Running scheduled health check for all providers')
        const results = await this.healthService.checkAllProviders()
        const failed = results.filter((r) => !r.success)
        this.logger.log(
          `Health check complete: ${results.length} checked, ${failed.length} failed`,
        )
        break
      }
      case 'check-provider': {
        const { provider } = job.data as { provider: string }
        this.logger.log(`Running health check for provider: ${provider}`)
        const result = await this.healthService.checkProvider(provider as any)
        await this.healthService.checkAndNotify(provider, result)
        this.logger.log(
          `Health check for ${provider}: ${result.success ? 'OK' : 'FAILED'} (${result.responseMs}ms)`,
        )
        break
      }
      case 'cleanup': {
        this.logger.log('Running health check cleanup')
        await this.healthService.cleanupOldChecks(7)
        break
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Health check job ${job.name} (${job.id}) failed: ${error.message}`,
    )
  }
}
