/**
 * Notifications Processor
 *
 * Handles notification delivery jobs through the NotificationService.
 * Routes notifications to appropriate channels based on user preferences.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger, Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { QUEUES, type NotificationJobData } from '../automation.types'
import { AutomationService } from '../automation.service'
import { NotificationService } from '../../notifications/notification.service'
import type { NotificationCategory } from '../../notifications/notification.types'

@Processor(QUEUES.NOTIFICATIONS)
@Injectable()
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name)

  constructor(
    private readonly automationService: AutomationService,
    private readonly notificationService: NotificationService,
  ) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing notification job ${job.id} (${job.name})`)

    const { type } = job.data

    switch (type) {
      case 'notification.send':
        await this.handleNotificationSend(job.data)
        break

      case 'notification.email_only':
        await this.handleEmailOnly(job.data)
        break

      case 'notification.email':
        await this.handleEmailNotification(job.data)
        break

      case 'notification.push':
        await this.handlePushNotification(job.data)
        break

      case 'notification.sms':
        // SMS not implemented yet
        this.logger.warn('SMS notifications not yet implemented')
        break

      default:
        this.logger.warn(`Unknown notification type: ${type}`)
    }
  }

  /**
   * Handle multi-channel notification (respects user preferences)
   */
  private async handleNotificationSend(data: NotificationJobData): Promise<void> {
    if (!data.userId) {
      this.logger.warn('notification.send requires userId')
      return
    }

    const result = await this.notificationService.send({
      userId: data.userId,
      category: (data.category || 'system_alerts') as NotificationCategory,
      title: data.title,
      body: data.body,
      data: data.metadata,
      actionUrl: data.actionUrl,
    })

    this.logger.log(
      `Notification sent to ${result.channels.length} channels for user ${data.userId}`
    )
  }

  /**
   * Handle email-only notification for contacts (no user preferences)
   */
  private async handleEmailOnly(data: NotificationJobData): Promise<void> {
    if (!data.contactId || !data.templateSlug || !data.agencyId) {
      this.logger.warn('notification.email_only requires contactId, templateSlug, and agencyId')
      return
    }

    const result = await this.notificationService.sendToContact({
      contactId: data.contactId,
      agencyId: data.agencyId,
      templateSlug: data.templateSlug,
      context: {
        agencyId: data.agencyId,
        ...(data.context || {}),
      },
    })

    if (result.success) {
      this.logger.log(`Email sent to contact ${data.contactId} using template ${data.templateSlug}`)
    } else {
      this.logger.warn(`Email to contact ${data.contactId} failed: ${result.error}`)
    }
  }

  /**
   * Handle direct email notification (legacy support)
   */
  private async handleEmailNotification(data: NotificationJobData): Promise<void> {
    if (!data.userId) {
      this.logger.warn('notification.email requires userId')
      return
    }

    // Route through NotificationService with email-only channel
    await this.notificationService.send({
      userId: data.userId,
      category: 'system_alerts',
      title: data.title,
      body: data.body,
      data: data.metadata,
      forceChannels: ['email'],
    })

    this.logger.log(`Email notification sent to user ${data.userId}`)
  }

  /**
   * Handle direct push notification (legacy support)
   */
  private async handlePushNotification(data: NotificationJobData): Promise<void> {
    if (!data.userId) {
      this.logger.warn('notification.push requires userId')
      return
    }

    // Route through NotificationService with push-only channel
    await this.notificationService.send({
      userId: data.userId,
      category: 'system_alerts',
      title: data.title,
      body: data.body,
      data: data.metadata,
      actionUrl: data.actionUrl,
      forceChannels: ['push'],
    })

    this.logger.log(`Push notification sent to user ${data.userId}`)
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
