/**
 * Email Service
 *
 * Core email sending functionality with logging and domain filtering.
 * Supports both direct sending and templated emails.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, and, desc, asc, ilike, or, gte, lte, sql } from 'drizzle-orm'
import { getResendClient } from './resend.client'
import { getPasswordResetTemplate, getWelcomeTemplate, getInviteTemplate, getClientPortalInviteTemplate } from './templates'
import { getEmailDomainFilter } from './email-domain-filter'
import { DatabaseService } from '../db/database.service'
import type { EmailLogsFilterDto } from './dto'
import type {
  EmailResult,
  EmailLogResponse,
  PaginatedEmailLogsResponse,
  EmailStatus,
} from '@tailfire/shared-types'

interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

interface SendEmailOptions {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
  // Context for logging
  agencyId: string
  tripId?: string
  contactId?: string
  activityId?: string
  templateSlug?: string
  variables?: Record<string, unknown>
  createdBy?: string
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly fromAddress: string
  private readonly fromName: string
  private readonly domainFilter = getEmailDomainFilter()

  constructor(private readonly db: DatabaseService) {
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@phoenixvoyages.ca'
    this.fromName = process.env.EMAIL_FROM_NAME || 'Phoenix Voyages'
  }

  /**
   * Core email sending method with logging
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    const { emailLogs } = this.db.schema

    // Apply domain filter (dev/preview only)
    const filterResult = this.domainFilter.filterRecipients(
      options.to,
      options.cc,
      options.bcc
    )

    // Modify subject in non-production
    const subject = this.domainFilter.modifySubject(options.subject)

    // Prepare HTML with filter warning if needed
    let html = options.html
    if (filterResult.isFiltered) {
      html = this.domainFilter.generateFilterWarningHtml() + html
    }

    // Log email as pending
    const insertResult = await this.db.client
      .insert(emailLogs)
      .values({
        agencyId: options.agencyId,
        toEmail: filterResult.to,
        ccEmail: filterResult.cc,
        bccEmail: filterResult.bcc,
        fromEmail: this.fromAddress,
        replyTo: options.replyTo,
        subject,
        bodyHtml: html,
        bodyText: options.text,
        templateSlug: options.templateSlug,
        variables: options.variables,
        status: 'pending',
        tripId: options.tripId,
        contactId: options.contactId,
        activityId: options.activityId,
        createdBy: options.createdBy,
      })
      .returning()

    const emailLog = insertResult[0]!

    // Check if we have valid recipients after filtering
    if (!filterResult.hasValidRecipients) {
      this.logger.warn(`No valid recipients after domain filtering for email ${emailLog.id}`)

      // Update log to filtered status
      await this.db.client
        .update(emailLogs)
        .set({
          status: 'filtered',
          errorMessage: 'All recipients filtered out by domain restrictions',
        })
        .where(eq(emailLogs.id, emailLog.id))

      return {
        success: false,
        emailLogId: emailLog.id,
        filtered: true,
        filteredRecipients: filterResult.filtered,
        error: 'All recipients filtered out by domain restrictions',
      }
    }

    try {
      const resend = getResendClient()
      const result = await resend.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: filterResult.to,
        cc: filterResult.cc,
        bcc: filterResult.bcc,
        replyTo: options.replyTo,
        subject,
        html,
        text: options.text,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      })

      if (result.error) {
        this.logger.error(`Failed to send email ${emailLog.id}: ${result.error.message}`)

        // Update log to failed status
        await this.db.client
          .update(emailLogs)
          .set({
            status: 'failed',
            errorMessage: result.error.message,
          })
          .where(eq(emailLogs.id, emailLog.id))

        return {
          success: false,
          emailLogId: emailLog.id,
          error: result.error.message,
        }
      }

      // Update log to sent status
      await this.db.client
        .update(emailLogs)
        .set({
          status: 'sent',
          providerMessageId: result.data?.id,
          sentAt: new Date(),
        })
        .where(eq(emailLogs.id, emailLog.id))

      this.logger.log(`Email sent successfully: ${emailLog.id}, provider_id: ${result.data?.id}`)

      return {
        success: true,
        emailLogId: emailLog.id,
        providerMessageId: result.data?.id,
        filtered: filterResult.isFiltered,
        filteredRecipients: filterResult.isFiltered ? filterResult.filtered : undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Email service error for ${emailLog.id}: ${errorMessage}`)

      // Update log to failed status
      await this.db.client
        .update(emailLogs)
        .set({
          status: 'failed',
          errorMessage,
        })
        .where(eq(emailLogs.id, emailLog.id))

      return {
        success: false,
        emailLogId: emailLog.id,
        error: errorMessage,
      }
    }
  }

  /**
   * Get email logs with filtering and pagination
   */
  async getEmailLogs(
    agencyId: string,
    filters: EmailLogsFilterDto
  ): Promise<PaginatedEmailLogsResponse> {
    const { emailLogs } = this.db.schema
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    // Build where conditions
    const conditions = [eq(emailLogs.agencyId, agencyId)]

    if (filters.status) {
      conditions.push(eq(emailLogs.status, filters.status))
    }

    if (filters.tripId) {
      conditions.push(eq(emailLogs.tripId, filters.tripId))
    }

    if (filters.contactId) {
      conditions.push(eq(emailLogs.contactId, filters.contactId))
    }

    if (filters.templateSlug) {
      conditions.push(eq(emailLogs.templateSlug, filters.templateSlug))
    }

    if (filters.fromDate) {
      conditions.push(gte(emailLogs.createdAt, new Date(filters.fromDate)))
    }

    if (filters.toDate) {
      conditions.push(lte(emailLogs.createdAt, new Date(filters.toDate)))
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(emailLogs.subject, `%${filters.search}%`),
          sql`${emailLogs.toEmail}::text ILIKE ${`%${filters.search}%`}`
        )!
      )
    }

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(and(...conditions))
    const count = countResult[0]?.count ?? 0

    // Determine sort order
    const sortField = filters.sortBy === 'sentAt' ? emailLogs.sentAt :
                      filters.sortBy === 'status' ? emailLogs.status :
                      emailLogs.createdAt
    const sortOrder = filters.sortOrder === 'asc' ? asc(sortField) : desc(sortField)

    // Get paginated results
    const logs = await this.db.client
      .select()
      .from(emailLogs)
      .where(and(...conditions))
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset)

    return {
      data: logs.map(this.mapToEmailLogResponse),
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    }
  }

  /**
   * Get a single email log by ID
   */
  async getEmailLog(agencyId: string, id: string): Promise<EmailLogResponse | null> {
    const { emailLogs } = this.db.schema

    const [log] = await this.db.client
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.id, id), eq(emailLogs.agencyId, agencyId)))
      .limit(1)

    return log ? this.mapToEmailLogResponse(log) : null
  }

  /**
   * Map database row to response DTO
   */
  private mapToEmailLogResponse(log: any): EmailLogResponse {
    return {
      id: log.id,
      agencyId: log.agencyId,
      toEmail: log.toEmail,
      ccEmail: log.ccEmail,
      bccEmail: log.bccEmail,
      fromEmail: log.fromEmail,
      replyTo: log.replyTo,
      subject: log.subject,
      bodyHtml: log.bodyHtml,
      bodyText: log.bodyText,
      templateSlug: log.templateSlug,
      variables: log.variables,
      status: log.status as EmailStatus,
      provider: log.provider,
      providerMessageId: log.providerMessageId,
      errorMessage: log.errorMessage,
      tripId: log.tripId,
      contactId: log.contactId,
      activityId: log.activityId,
      sentAt: log.sentAt?.toISOString() || null,
      createdAt: log.createdAt.toISOString(),
      createdBy: log.createdBy,
    }
  }

  /**
   * Send email with attachments (convenience method)
   * Used for sending documents like Trip Order PDFs
   */
  async sendEmailWithAttachments(options: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    html: string
    text?: string
    replyTo?: string
    attachments: EmailAttachment[]
    agencyId: string
    tripId?: string
    contactId?: string
    activityId?: string
    templateSlug?: string
    variables?: Record<string, unknown>
    createdBy?: string
  }): Promise<EmailResult> {
    return this.sendEmail(options)
  }

  // ==========================================================================
  // Templated Email Methods
  // ==========================================================================

  /**
   * Send an email using a template with variable substitution
   * Requires EmailTemplatesService to be injected separately
   */
  async sendTemplatedEmailWithRenderedContent(
    options: {
      to: string[]
      cc?: string[]
      bcc?: string[]
      replyTo?: string
      subject: string
      html: string
      text?: string
      agencyId: string
      tripId?: string
      contactId?: string
      activityId?: string
      templateSlug: string
      variables?: Record<string, unknown>
      createdBy?: string
    }
  ): Promise<EmailResult> {
    return this.sendEmail({
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      agencyId: options.agencyId,
      tripId: options.tripId,
      contactId: options.contactId,
      activityId: options.activityId,
      templateSlug: options.templateSlug,
      variables: options.variables,
      createdBy: options.createdBy,
    })
  }

  // ==========================================================================
  // Legacy methods (preserved for backward compatibility)
  // ==========================================================================

  async sendPasswordResetEmail(email: string, resetLink: string, agencyId: string): Promise<void> {
    const html = getPasswordResetTemplate({ resetLink })
    await this.sendEmail({
      to: [email],
      subject: 'Reset Your Password',
      html,
      agencyId,
      templateSlug: 'password-reset',
      variables: { reset_link: resetLink },
    })
    this.logger.log(`Password reset email sent to ${email}`)
  }

  async sendWelcomeEmail(email: string, firstName: string, agencyId: string): Promise<void> {
    const html = getWelcomeTemplate({ firstName })
    await this.sendEmail({
      to: [email],
      subject: 'Welcome to Phoenix Voyages',
      html,
      agencyId,
      templateSlug: 'welcome',
      variables: { 'contact.first_name': firstName },
    })
    this.logger.log(`Welcome email sent to ${email}`)
  }

  async sendInviteEmail(
    email: string,
    inviteLink: string,
    firstName: string,
    agencyId: string,
    inviterName?: string,
  ): Promise<void> {
    const html = getInviteTemplate({ inviteLink, firstName, inviterName })
    await this.sendEmail({
      to: [email],
      subject: "You're Invited to Phoenix Voyages",
      html,
      agencyId,
      templateSlug: 'invite',
      variables: {
        invite_link: inviteLink,
        'contact.first_name': firstName,
        inviter_name: inviterName || 'Someone',
      },
    })
    this.logger.log('Invite email sent')
    this.logger.debug(`Invite email sent to ${email}`)
  }

  async sendClientPortalInviteEmail(
    email: string,
    inviteLink: string,
    firstName: string,
    agencyId: string,
    agentName?: string,
    contactId?: string,
  ): Promise<EmailResult> {
    const html = getClientPortalInviteTemplate({ inviteLink, firstName, agentName })
    const result = await this.sendEmail({
      to: [email],
      subject: 'Access Your Phoenix Voyages Travel Portal',
      html,
      agencyId,
      contactId,
      templateSlug: 'client-portal-invite',
      variables: {
        invite_link: inviteLink,
        'contact.first_name': firstName,
        agent_name: agentName || '',
      },
    })
    this.logger.log(`Client portal invite email sent to ${email}`)
    return result
  }
}
