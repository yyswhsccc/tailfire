/**
 * Notification Service
 *
 * Central routing service for multi-channel notifications.
 * Routes notifications to appropriate channels based on user preferences.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { TZDate } from '@date-fns/tz'
import { isWithinInterval } from 'date-fns'
import { DatabaseService } from '../db/database.service'
import { EmailService } from '../email/email.service'
import { EmailTemplatesService } from '../email/email-templates.service'
import { VariableResolverService } from '../email/variable-resolver.service'
import { PlatformNotificationService } from './platform-notification.service'
import { PushNotificationService } from './push-notification.service'
import type {
  NotificationCategory,
  NotificationChannel,
  SendNotificationParams,
  SendToContactParams,
  NotificationResult,
  PushToken,
  CategoryPreferences,
} from './notification.types'

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly variableResolver: VariableResolverService,
    private readonly platformService: PlatformNotificationService,
    private readonly pushService: PushNotificationService,
  ) {}

  /**
   * Send notification to a user through their preferred channels
   *
   * @param params - Notification parameters
   * @returns Result with status for each channel
   */
  async send(params: SendNotificationParams): Promise<NotificationResult> {
    const {
      userId,
      category,
      title,
      body,
      data,
      forceChannels,
      skipQuietHours,
      actionUrl,
    } = params

    // 1. Load user preferences
    const prefs = await this.getPreferences(userId)

    // 2. Determine which channels to use
    let channels: NotificationChannel[]
    if (forceChannels) {
      channels = forceChannels
    } else {
      channels = this.getChannelsForCategory(prefs, category)
    }

    // 3. Filter channels based on quiet hours (except platform - always deliver)
    if (!skipQuietHours) {
      channels = this.filterQuietHours(channels, prefs)
    }

    // 4. Get agency ID for the user
    const agencyId = prefs?.agencyId || (await this.getUserAgencyId(userId))

    if (!agencyId) {
      this.logger.warn(`Cannot send notification - no agency found for user ${userId}`)
      return { channels: [], results: {} }
    }

    // 5. Send to each channel concurrently
    const results: NotificationResult['results'] = {}

    const promises: Promise<void>[] = []

    // Platform (in-app) - always delivered
    if (channels.includes('platform') && prefs?.platformEnabled !== false) {
      promises.push(
        this.platformService
          .create({
            userId,
            agencyId,
            category,
            title,
            body,
            actionUrl,
            metadata: data,
          })
          .then((notification) => {
            results.platform = { success: true, notificationId: notification.id }
          })
          .catch((error) => {
            this.logger.error(`Platform notification failed: ${error}`)
            results.platform = { success: false, error: String(error) }
          })
      )
    }

    // Push notification
    if (channels.includes('push') && prefs?.pushEnabled) {
      const tokens = (prefs.pushTokens as PushToken[]) || []
      if (tokens.length > 0) {
        promises.push(
          this.pushService
            .send(
              tokens.map((t) => t.token),
              { title, body, data, actionUrl }
            )
            .then((result) => {
              results.push = {
                success: result.success > 0,
                sentCount: result.success,
                failedCount: result.failed,
              }
              // Cleanup failed tokens if any
              if (result.failedTokens && result.failedTokens.length > 0) {
                this.pushService.cleanupFailedTokens(userId, result.failedTokens)
              }
            })
            .catch((error) => {
              this.logger.error(`Push notification failed: ${error}`)
              results.push = { success: false, error: String(error) }
            })
        )
      }
    }

    // Email notification - for agent notifications (not contacts)
    if (channels.includes('email') && prefs?.emailEnabled) {
      promises.push(
        this.sendAgentEmail(userId, agencyId, title, body, data)
          .then((success) => {
            results.email = { success }
          })
          .catch((error) => {
            this.logger.error(`Email notification failed: ${error}`)
            results.email = { success: false, error: String(error) }
          })
      )
    }

    await Promise.all(promises)

    return { channels, results }
  }

  /**
   * Send email to a contact (client) using a template
   * No user preferences involved - email only
   *
   * @param params - Contact email parameters
   */
  async sendToContact(params: SendToContactParams): Promise<{ success: boolean; error?: string }> {
    const { contactId, agencyId, templateSlug, context, tripId, activityId, paymentItemId, createdBy } = params

    try {
      // 1. Get contact email
      const [contact] = await this.db.client
        .select({
          email: this.db.schema.contacts.email,
          firstName: this.db.schema.contacts.firstName,
        })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, contactId))
        .limit(1)

      if (!contact?.email) {
        this.logger.warn(`Contact ${contactId} has no email - skipping`)
        return { success: false, error: 'Contact has no email address' }
      }

      // 2. Get and render template
      const template = await this.emailTemplatesService.getTemplateBySlug(templateSlug, agencyId)
      if (!template) {
        this.logger.warn(`Email template "${templateSlug}" not found`)
        return { success: false, error: `Template "${templateSlug}" not found` }
      }

      // Build resolver context
      const resolverContext = {
        agencyId: context.agencyId || agencyId,
        tripId: context.tripId || tripId,
        contactId: context.contactId || contactId,
        activityId: context.activityId || activityId,
        agentId: context.agentId,
        paymentItemId: context.paymentItemId || paymentItemId,
      }

      // Render subject and body
      const subject = await this.variableResolver.resolveText(
        template.subject,
        resolverContext,
        context.customVariables
      )
      const htmlBody = await this.variableResolver.resolveText(
        template.bodyHtml,
        resolverContext,
        context.customVariables
      )

      // 3. Send email
      const result = await this.emailService.sendEmail({
        to: [contact.email],
        subject,
        html: htmlBody,
        agencyId,
        tripId,
        contactId,
        activityId,
        templateSlug,
        variables: resolverContext,
        createdBy,
      })

      return { success: result.success, error: result.error }
    } catch (error) {
      this.logger.error(`Failed to send email to contact ${contactId}: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Get or create user preferences
   */
  async getPreferences(userId: string): Promise<any | null> {
    const [prefs] = await this.db.client
      .select()
      .from(this.db.schema.notificationPreferences)
      .where(eq(this.db.schema.notificationPreferences.userId, userId))
      .limit(1)

    return prefs || null
  }

  /**
   * Ensure preferences exist for a user, creating defaults if needed
   */
  async ensurePreferences(userId: string, agencyId: string): Promise<any> {
    const existing = await this.getPreferences(userId)
    if (existing) return existing

    const [created] = await this.db.client
      .insert(this.db.schema.notificationPreferences)
      .values({
        userId,
        agencyId,
        emailEnabled: true,
        pushEnabled: false,
        platformEnabled: true,
      })
      .returning()

    this.logger.debug(`Created default notification preferences for user ${userId}`)
    return created
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userId: string,
    agencyId: string,
    updates: {
      emailEnabled?: boolean
      pushEnabled?: boolean
      platformEnabled?: boolean
      categoryPreferences?: any
      quietHoursStart?: string | null
      quietHoursEnd?: string | null
      timezone?: string
    }
  ): Promise<any> {
    // Ensure preferences exist
    await this.ensurePreferences(userId, agencyId)

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (updates.emailEnabled !== undefined) {
      updateData.emailEnabled = updates.emailEnabled
    }
    if (updates.pushEnabled !== undefined) {
      updateData.pushEnabled = updates.pushEnabled
    }
    if (updates.platformEnabled !== undefined) {
      updateData.platformEnabled = updates.platformEnabled
    }
    if (updates.categoryPreferences !== undefined) {
      updateData.categoryPreferences = updates.categoryPreferences
    }
    if (updates.quietHoursStart !== undefined) {
      updateData.quietHoursStart = updates.quietHoursStart
    }
    if (updates.quietHoursEnd !== undefined) {
      updateData.quietHoursEnd = updates.quietHoursEnd
    }
    if (updates.timezone !== undefined) {
      updateData.timezone = updates.timezone
    }

    const [updated] = await this.db.client
      .update(this.db.schema.notificationPreferences)
      .set(updateData)
      .where(eq(this.db.schema.notificationPreferences.userId, userId))
      .returning()

    this.logger.debug(`Updated notification preferences for user ${userId}`)
    return updated
  }

  /**
   * Register a push notification token for a user
   */
  async registerPushToken(
    userId: string,
    agencyId: string,
    tokenData: {
      token: string
      device: string
      platform: 'ios' | 'android' | 'web'
    }
  ): Promise<{ success: boolean; tokenCount: number }> {
    // Ensure preferences exist
    const prefs = await this.ensurePreferences(userId, agencyId)
    const existingTokens: PushToken[] = (prefs.pushTokens as PushToken[]) || []

    // Check if token already exists
    const existingIndex = existingTokens.findIndex((t) => t.token === tokenData.token)
    const now = new Date().toISOString()

    if (existingIndex >= 0) {
      // Update existing token's lastUsed
      existingTokens[existingIndex] = {
        ...existingTokens[existingIndex]!,
        device: tokenData.device,
        platform: tokenData.platform,
        lastUsed: now,
      }
    } else {
      // Add new token
      existingTokens.push({
        token: tokenData.token,
        device: tokenData.device,
        platform: tokenData.platform,
        createdAt: now,
        lastUsed: now,
      })
    }

    // Update preferences with new tokens array
    await this.db.client
      .update(this.db.schema.notificationPreferences)
      .set({
        pushTokens: existingTokens,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.notificationPreferences.userId, userId))

    this.logger.debug(`Registered push token for user ${userId} (device: ${tokenData.device})`)
    return { success: true, tokenCount: existingTokens.length }
  }

  /**
   * Remove a push notification token for a user
   */
  async removePushToken(userId: string, token: string): Promise<{ success: boolean; tokenCount: number }> {
    const prefs = await this.getPreferences(userId)
    if (!prefs) {
      return { success: false, tokenCount: 0 }
    }

    const existingTokens: PushToken[] = (prefs.pushTokens as PushToken[]) || []
    const filteredTokens = existingTokens.filter((t) => t.token !== token)

    if (filteredTokens.length === existingTokens.length) {
      // Token not found
      return { success: false, tokenCount: existingTokens.length }
    }

    await this.db.client
      .update(this.db.schema.notificationPreferences)
      .set({
        pushTokens: filteredTokens,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.notificationPreferences.userId, userId))

    this.logger.debug(`Removed push token for user ${userId}`)
    return { success: true, tokenCount: filteredTokens.length }
  }

  /**
   * Get list of registered push tokens for a user
   */
  async getPushTokens(userId: string): Promise<PushToken[]> {
    const prefs = await this.getPreferences(userId)
    if (!prefs) {
      return []
    }
    return (prefs.pushTokens as PushToken[]) || []
  }

  /**
   * Determine which channels to use for a category based on preferences
   */
  private getChannelsForCategory(
    prefs: any | null,
    category: NotificationCategory
  ): NotificationChannel[] {
    // Default channels if no preferences
    const defaultChannels: Record<NotificationCategory, NotificationChannel[]> = {
      payment_reminders: ['email', 'platform'],
      trip_updates: ['email', 'push', 'platform'],
      client_care: ['email', 'platform'],  // email.received uses forceChannels: ['platform'] to prevent loops
      booking_alerts: ['email', 'push', 'platform'],
      system_alerts: ['platform'],
      assignment: ['email', 'push', 'platform'],
      collaboration: ['email', 'platform'],
      payment_alert: ['email', 'push', 'platform'],
      contact_share: ['platform'],
    }

    if (!prefs?.categoryPreferences) {
      return defaultChannels[category] || ['platform']
    }

    const categoryPrefs = prefs.categoryPreferences as CategoryPreferences
    const channels = categoryPrefs[category]

    if (!channels || channels.length === 0) {
      return defaultChannels[category] || ['platform']
    }

    // Filter by enabled channels
    return channels.filter((channel: NotificationChannel) => {
      switch (channel) {
        case 'email':
          return prefs.emailEnabled !== false
        case 'push':
          return prefs.pushEnabled === true
        case 'platform':
          return prefs.platformEnabled !== false
        default:
          return false
      }
    })
  }

  /**
   * Filter channels based on quiet hours
   * Platform is always delivered regardless of quiet hours
   */
  private filterQuietHours(channels: NotificationChannel[], prefs: any | null): NotificationChannel[] {
    if (!prefs?.quietHoursStart || !prefs?.quietHoursEnd) {
      return channels
    }

    const timezone = prefs.timezone || 'America/Toronto'
    const now = new TZDate(new Date(), timezone)

    // Parse quiet hours
    const [startHour, startMin] = prefs.quietHoursStart.split(':').map(Number)
    const [endHour, endMin] = prefs.quietHoursEnd.split(':').map(Number)

    const startTime = new TZDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      startHour!,
      startMin!,
      0,
      timezone
    )
    let endTime = new TZDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      endHour!,
      endMin!,
      0,
      timezone
    )

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (endTime <= startTime) {
      endTime = new TZDate(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        endHour!,
        endMin!,
        0,
        timezone
      )
    }

    const isQuietTime = isWithinInterval(now, { start: startTime, end: endTime })

    if (isQuietTime) {
      // During quiet hours, only platform notifications are allowed
      return channels.filter((c) => c === 'platform')
    }

    return channels
  }

  /**
   * Get agency ID for a user
   */
  private async getUserAgencyId(userId: string): Promise<string | null> {
    const [profile] = await this.db.client
      .select({ agencyId: this.db.schema.userProfiles.agencyId })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    return profile?.agencyId || null
  }

  /**
   * Send email notification to an agent (user)
   */
  private async sendAgentEmail(
    userId: string,
    agencyId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<boolean> {
    // Get user email
    const [user] = await this.db.client
      .select({ email: this.db.schema.userProfiles.email })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    if (!user?.email) {
      this.logger.warn(`User ${userId} has no email - skipping email notification`)
      return false
    }

    // Send simple notification email
    const result = await this.emailService.sendEmail({
      to: [user.email],
      subject: title,
      html: `<p>${body}</p>`,
      agencyId,
    })

    return result.success
  }
}
