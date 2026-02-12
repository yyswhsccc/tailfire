/**
 * Notification Module
 *
 * Multi-channel notification system with support for:
 * - Email (via Resend)
 * - Push notifications (via Firebase)
 * - Platform/In-app notifications
 *
 * Features:
 * - User preference-based routing
 * - Quiet hours support
 * - Category-based channel selection
 * - Template rendering for contact emails
 */

import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../db/database.module'
import { EmailModule } from '../email/email.module'
import { NotificationService } from './notification.service'
import { PlatformNotificationService } from './platform-notification.service'
import { PushNotificationService } from './push-notification.service'
import { NotificationPreferencesController } from './notification-preferences.controller'
import { NotificationsController } from './notifications.controller'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    forwardRef(() => EmailModule),
  ],
  controllers: [NotificationPreferencesController, NotificationsController],
  providers: [
    NotificationService,
    PlatformNotificationService,
    PushNotificationService,
  ],
  exports: [
    NotificationService,
    PlatformNotificationService,
    PushNotificationService,
  ],
})
export class NotificationModule {}
