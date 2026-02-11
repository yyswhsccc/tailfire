/**
 * Push Notification Service
 *
 * Firebase Cloud Messaging (FCM) integration for push notifications.
 * Handles token management and notification delivery to iOS, Android, and Web.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { PushPayload, PushResult, PushToken } from './notification.types'

// Firebase Admin SDK is optional - we'll handle gracefully if not installed
let firebaseAdmin: any = null

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name)
  private firebaseApp: any = null
  private isInitialized = false

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase()
  }

  private async initializeFirebase(): Promise<void> {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID')
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL')
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase credentials not configured - push notifications disabled')
      return
    }

    try {
      // Dynamic import to handle cases where firebase-admin isn't installed
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Optional dependency, may not be installed
      firebaseAdmin = await import('firebase-admin').catch(() => null)

      if (!firebaseAdmin) {
        this.logger.warn('firebase-admin package not installed - push notifications disabled')
        return
      }

      // Check if already initialized
      if (firebaseAdmin.apps?.length > 0) {
        this.firebaseApp = firebaseAdmin.apps[0]
      } else {
        this.firebaseApp = firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert({
            projectId,
            clientEmail,
            // Private key comes with escaped newlines from env
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        })
      }

      this.isInitialized = true
      this.logger.log('Firebase Admin SDK initialized successfully')
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error}`)
    }
  }

  /**
   * Check if push notifications are available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.firebaseApp !== null
  }

  /**
   * Send push notification to multiple device tokens
   */
  async send(tokens: string[], notification: PushPayload): Promise<PushResult> {
    if (!this.isAvailable()) {
      this.logger.debug('Push notifications not available - skipping')
      return { success: 0, failed: tokens.length }
    }

    if (tokens.length === 0) {
      return { success: 0, failed: 0 }
    }

    const message: any = {
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data
        ? Object.fromEntries(
            Object.entries(notification.data).map(([k, v]) => [k, String(v)])
          )
        : undefined,
      // Platform-specific configurations
      webpush: {
        notification: {
          icon: '/icons/notification-icon.png',
          badge: '/icons/badge-icon.png',
        },
        fcmOptions: {
          link: notification.actionUrl,
        },
      },
      android: {
        notification: {
          icon: 'notification_icon',
          color: '#4F46E5', // Tailfire brand color
          clickAction: notification.actionUrl,
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
    }

    try {
      const messaging = firebaseAdmin.messaging(this.firebaseApp)
      const response = await messaging.sendEachForMulticast(message)

      // Collect failed tokens for cleanup
      const failedTokens: string[] = []
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          const errorCode = resp.error?.code
          // These error codes indicate invalid tokens that should be removed
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokens[idx]!)
          }
        }
      })

      this.logger.debug(
        `Push notification sent: ${response.successCount} success, ${response.failureCount} failed`
      )

      return {
        success: response.successCount,
        failed: response.failureCount,
        failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
      }
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error}`)
      return { success: 0, failed: tokens.length }
    }
  }

  /**
   * Register a push token for a user
   */
  async registerToken(
    userId: string,
    token: PushToken,
  ): Promise<void> {
    try {
      // Get current preferences
      const [prefs] = await this.db.client
        .select()
        .from(this.db.schema.notificationPreferences)
        .where(eq(this.db.schema.notificationPreferences.userId, userId))
        .limit(1)

      if (!prefs) {
        this.logger.warn(`No notification preferences found for user ${userId}`)
        return
      }

      // Get current tokens
      const currentTokens: PushToken[] = (prefs.pushTokens as PushToken[]) || []

      // Check if token already exists
      const existingIndex = currentTokens.findIndex((t) => t.token === token.token)

      if (existingIndex >= 0) {
        // Update existing token
        currentTokens[existingIndex] = {
          ...currentTokens[existingIndex],
          ...token,
          lastUsed: new Date().toISOString(),
        }
      } else {
        // Add new token
        currentTokens.push({
          ...token,
          createdAt: new Date().toISOString(),
        })
      }

      // Update preferences
      await this.db.client
        .update(this.db.schema.notificationPreferences)
        .set({
          pushTokens: currentTokens,
          pushEnabled: true, // Auto-enable push when token is registered
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.notificationPreferences.userId, userId))

      this.logger.debug(`Registered push token for user ${userId}`)
    } catch (error) {
      this.logger.error(`Failed to register push token: ${error}`)
      throw error
    }
  }

  /**
   * Remove a push token (on logout or uninstall)
   */
  async removeToken(userId: string, token: string): Promise<void> {
    try {
      const [prefs] = await this.db.client
        .select()
        .from(this.db.schema.notificationPreferences)
        .where(eq(this.db.schema.notificationPreferences.userId, userId))
        .limit(1)

      if (!prefs) return

      const currentTokens: PushToken[] = (prefs.pushTokens as PushToken[]) || []
      const updatedTokens = currentTokens.filter((t) => t.token !== token)

      await this.db.client
        .update(this.db.schema.notificationPreferences)
        .set({
          pushTokens: updatedTokens,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.notificationPreferences.userId, userId))

      this.logger.debug(`Removed push token for user ${userId}`)
    } catch (error) {
      this.logger.error(`Failed to remove push token: ${error}`)
      throw error
    }
  }

  /**
   * Get all tokens for a user
   */
  async getTokens(userId: string): Promise<PushToken[]> {
    const [prefs] = await this.db.client
      .select({ pushTokens: this.db.schema.notificationPreferences.pushTokens })
      .from(this.db.schema.notificationPreferences)
      .where(eq(this.db.schema.notificationPreferences.userId, userId))
      .limit(1)

    return (prefs?.pushTokens as PushToken[]) || []
  }

  /**
   * Clean up invalid tokens from a user's preferences
   */
  async cleanupFailedTokens(userId: string, failedTokens: string[]): Promise<void> {
    if (failedTokens.length === 0) return

    try {
      const [prefs] = await this.db.client
        .select()
        .from(this.db.schema.notificationPreferences)
        .where(eq(this.db.schema.notificationPreferences.userId, userId))
        .limit(1)

      if (!prefs) return

      const currentTokens: PushToken[] = (prefs.pushTokens as PushToken[]) || []
      const updatedTokens = currentTokens.filter((t) => !failedTokens.includes(t.token))

      if (updatedTokens.length !== currentTokens.length) {
        await this.db.client
          .update(this.db.schema.notificationPreferences)
          .set({
            pushTokens: updatedTokens,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.notificationPreferences.userId, userId))

        this.logger.debug(
          `Cleaned up ${currentTokens.length - updatedTokens.length} invalid tokens for user ${userId}`
        )
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup tokens: ${error}`)
    }
  }
}
