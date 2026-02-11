/**
 * Notifications Processor
 *
 * Handles notification delivery jobs (email, push, SMS).
 * Placeholder implementation - integrates with actual notification services when ready.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger, Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { QUEUES, type NotificationJobData } from '../automation.types'
import { AutomationService } from '../automation.service'

@Processor(QUEUES.NOTIFICATIONS)
@Injectable()
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name)

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly automationService: AutomationService,
  ) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing notification job ${job.id} (${job.name})`)

    const { type } = job.data

    switch (type) {
      case 'notification.email':
        await this.handleEmailNotification(job.data)
        break

      case 'notification.push':
        await this.handlePushNotification(job.data)
        break

      case 'notification.sms':
        await this.handleSmsNotification(job.data)
        break

      default:
        this.logger.warn(`Unknown notification type: ${type}`)
    }
  }

  private async handleEmailNotification(data: NotificationJobData): Promise<void> {
    // Emit event for email service to handle
    this.eventEmitter.emit('notification.email', data)
    this.logger.log(`Email notification emitted: ${data.title}`)
  }

  private async handlePushNotification(data: NotificationJobData): Promise<void> {
    // Emit event for push notification service
    this.eventEmitter.emit('notification.push', data)
    this.logger.log(`Push notification emitted: ${data.title}`)
  }

  private async handleSmsNotification(data: NotificationJobData): Promise<void> {
    // Emit event for SMS service
    this.eventEmitter.emit('notification.sms', data)
    this.logger.log(`SMS notification emitted: ${data.title}`)
  }

  // ============================================================================
  // Worker Events
  // ============================================================================

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Notification job ${job.id} started processing`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.NOTIFICATIONS, job.id, 'processing')
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Notification job ${job.id} completed`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.NOTIFICATIONS, job.id, 'completed')
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Notification job ${job.id} failed: ${error.message}`, error.stack)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.NOTIFICATIONS, job.id, 'failed', error.message)
    }
  }
}
