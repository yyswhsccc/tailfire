/**
 * Email Service
 *
 * Core email sending functionality with logging and domain filtering.
 * Supports both direct sending and templated emails.
 */

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common'
import { eq, and, desc, asc, ilike, or, gte, lte, sql, isNull } from 'drizzle-orm'
import { getResendClient } from './resend.client'
import { getPasswordResetTemplate, getWelcomeTemplate, getInviteTemplate, getClientPortalInviteTemplate, getTripReassignmentTemplate, getTripBulkReassignmentTemplate } from './templates'
import { getEmailDomainFilter } from './email-domain-filter'
import { buildEmailBody } from '../common/email/build-email-body'
import { DatabaseService } from '../db/database.service'
import { SmtpSendService } from '../email-accounts/smtp-send.service'
import { EmailAccountsService } from '../email-accounts/email-accounts.service'
import type { EmailLogsFilterDto } from './dto'
import type {
  EmailResult,
  EmailLogResponse,
  PaginatedEmailLogsResponse,
  EmailStatus,
  EmailCategory,
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

  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(forwardRef(() => SmtpSendService))
    private readonly smtpSendService?: SmtpSendService,
    @Optional()
    @Inject(forwardRef(() => EmailAccountsService))
    private readonly emailAccountsService?: EmailAccountsService,
  ) {
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@phoenixvoyages.ca'
    this.fromName = process.env.EMAIL_FROM_NAME || 'Phoenix Voyages'

    if (!this.smtpSendService) {
      this.logger.warn('SmtpSendService not injected — SMTP routing disabled, Resend-only mode')
    }
  }

  /**
   * Core email sending method with SMTP-first routing and Resend fallback.
   *
   * Flow:
   * 1. Resolve agent (contactId → tripId → createdBy waterfall)
   * 2. Build email body with signature + footer
   * 3. Apply domain filter
   * 4. Log as pending
   * 5. Try SMTP if agent has email account
   * 6. Fall back to Resend on pre-delivery SMTP failure
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    const { emailLogs } = this.db.schema

    // 1. Resolve agent for SMTP routing
    const agent = await this.resolveAgent(options.agencyId, {
      contactId: options.contactId,
      tripId: options.tripId,
      createdBy: options.createdBy,
    })

    // 2. Load signature + footer, build final HTML
    const { signatureHtml, complianceFooter } =
      await this.loadSignatureAndFooter(
        options.agencyId,
        agent?.userId,
      )
    let html = buildEmailBody(options.html, { signatureHtml, complianceFooter })

    // 3. Apply domain filter (dev/preview only)
    const filterResult = this.domainFilter.filterRecipients(
      options.to,
      options.cc,
      options.bcc,
    )
    const subject = this.domainFilter.modifySubject(options.subject)

    if (filterResult.isFiltered) {
      html = this.domainFilter.generateFilterWarningHtml() + html
    }

    // 4. Determine from address (agent email for SMTP path, noreply for Resend)
    const fromEmail = agent?.emailAccountId && agent.emailAddress
      ? agent.emailAddress
      : this.fromAddress

    // 5. Log email as pending
    const insertResult = await this.db.client
      .insert(emailLogs)
      .values({
        agencyId: options.agencyId,
        toEmail: filterResult.to,
        ccEmail: filterResult.cc,
        bccEmail: filterResult.bcc,
        fromEmail,
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
      this.logger.warn(
        `No valid recipients after domain filtering for email ${emailLog.id}`,
      )

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

    // 6. Try SMTP if agent has email account
    if (agent?.emailAccountId && this.smtpSendService) {
      try {
        const smtpResult = await this.smtpSendService.sendRaw({
          accountId: agent.emailAccountId,
          from: agent.displayName
            ? `"${agent.displayName}" <${agent.emailAddress}>`
            : agent.emailAddress!,
          to: filterResult.to,
          cc: filterResult.cc,
          bcc: filterResult.bcc,
          subject,
          html,
          text: options.text,
          replyTo: options.replyTo,
          attachments: options.attachments?.map((att) => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          })),
        })

        // SMTP accepted — persist to DB (double-send prevention: if this fails, do NOT resend)
        try {
          const allRecipients = [
            ...filterResult.to,
            ...(filterResult.cc || []),
            ...(filterResult.bcc || []),
          ]
          const matchedContactIds = await this.matchRecipientContacts(
            options.agencyId,
            allRecipients,
          )

          await this.db.client
            .insert(this.db.schema.syncedEmails)
            .values({
              emailAccountId: agent.emailAccountId,
              agencyId: options.agencyId,
              messageId: smtpResult.messageId,
              imapUid: null,
              folder: 'Sent',
              fromAddress: agent.emailAddress,
              fromName: agent.displayName,
              toAddresses: filterResult.to.map((addr) => ({ address: addr })),
              ccAddresses: (filterResult.cc || []).map((addr) => ({
                address: addr,
              })),
              bccAddresses: (filterResult.bcc || []).map((addr) => ({
                address: addr,
              })),
              subject,
              date: new Date(),
              bodyHtml: html,
              bodyText: options.text,
              snippet: options.html
                .replace(/<[^>]+>/g, '')
                .substring(0, 200)
                .trim(),
              isSeen: true,
              isOutbound: true,
              matchedContactIds,
            })

          await this.db.client
            .update(emailLogs)
            .set({
              status: 'sent',
              provider: 'smtp',
              providerMessageId: smtpResult.messageId,
              sentAt: new Date(),
            })
            .where(eq(emailLogs.id, emailLog.id))
        } catch (dbError: any) {
          // SMTP accepted but DB write failed — email was sent, do NOT resend
          this.logger.error(
            `Post-SMTP DB write failed for ${emailLog.id}: ${dbError.message}`,
          )
          try {
            await this.db.client
              .update(emailLogs)
              .set({ status: 'sent', provider: 'smtp', sentAt: new Date() })
              .where(eq(emailLogs.id, emailLog.id))
          } catch {
            /* best-effort */
          }
        }

        this.logger.log(
          `Email sent via SMTP: ${emailLog.id}, messageId: ${smtpResult.messageId}`,
        )
        return {
          success: true,
          emailLogId: emailLog.id,
          filtered: filterResult.isFiltered,
          filteredRecipients: filterResult.isFiltered ? filterResult.filtered : undefined,
        }
      } catch (smtpError: any) {
        // SMTP pre-delivery failure — fall through to Resend
        this.logger.warn(
          `SMTP send failed for ${emailLog.id}, falling back to Resend: ${smtpError.message}`,
        )
        await this.db.client
          .update(emailLogs)
          .set({
            errorMessage: `SMTP failed: ${smtpError.message}`,
            fromEmail: this.fromAddress,
            replyTo: agent?.emailAddress || options.replyTo || null,
          })
          .where(eq(emailLogs.id, emailLog.id))
      }
    }

    // 7. Resend fallback
    try {
      const resend = getResendClient()
      const result = await resend.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: filterResult.to,
        cc: filterResult.cc,
        bcc: filterResult.bcc,
        replyTo: (agent?.emailAddress || options.replyTo) ?? undefined,
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
        this.logger.error(
          `Failed to send email ${emailLog.id}: ${result.error.message}`,
        )

        await this.db.client
          .update(emailLogs)
          .set({
            status: 'failed',
            provider: 'resend',
            errorMessage: result.error.message,
          })
          .where(eq(emailLogs.id, emailLog.id))

        return {
          success: false,
          emailLogId: emailLog.id,
          error: result.error.message,
        }
      }

      const resendReplyTo = agent?.emailAddress || options.replyTo || null
      await this.db.client
        .update(emailLogs)
        .set({
          status: 'sent',
          provider: 'resend',
          providerMessageId: result.data?.id,
          sentAt: new Date(),
          fromEmail: this.fromAddress,
          replyTo: resendReplyTo,
        })
        .where(eq(emailLogs.id, emailLog.id))

      this.logger.log(
        `Email sent via Resend: ${emailLog.id}, provider_id: ${result.data?.id}`,
      )

      return {
        success: true,
        emailLogId: emailLog.id,
        filtered: filterResult.isFiltered,
        filteredRecipients: filterResult.isFiltered ? filterResult.filtered : undefined,
      }
    } catch (error: any) {
      this.logger.error(
        `Resend send failed for email ${emailLog.id}: ${error.message}`,
      )

      await this.db.client
        .update(emailLogs)
        .set({
          status: 'failed',
          provider: 'resend',
          errorMessage: error.message,
        })
        .where(eq(emailLogs.id, emailLog.id))

      return {
        success: false,
        emailLogId: emailLog.id,
        error: error.message,
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
    const { emailLogs, emailTemplates, contacts } = this.db.schema
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
      // Fallback: also match by toEmail containing the contact's email address
      const [contact] = await this.db.client
        .select({ email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.id, filters.contactId), eq(contacts.agencyId, agencyId)))
        .limit(1)

      if (contact?.email) {
        const contactEmail = contact.email.toLowerCase()
        conditions.push(
          or(
            eq(emailLogs.contactId, filters.contactId),
            sql`EXISTS (SELECT 1 FROM unnest(${emailLogs.toEmail}) AS e WHERE lower(e) = ${contactEmail})`
          )!
        )
      } else {
        conditions.push(eq(emailLogs.contactId, filters.contactId))
      }
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

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(whereClause)
    const count = countResult[0]?.count ?? 0

    // Determine sort order
    const sortField = filters.sortBy === 'sentAt' ? emailLogs.sentAt :
                      filters.sortBy === 'status' ? emailLogs.status :
                      emailLogs.createdAt
    const sortOrder = filters.sortOrder === 'asc' ? asc(sortField) : desc(sortField)

    // Get paginated results — exclude bodyHtml/bodyText, join templates for category
    const logs = await this.db.client
      .select({
        id: emailLogs.id,
        agencyId: emailLogs.agencyId,
        toEmail: emailLogs.toEmail,
        ccEmail: emailLogs.ccEmail,
        bccEmail: emailLogs.bccEmail,
        fromEmail: emailLogs.fromEmail,
        replyTo: emailLogs.replyTo,
        subject: emailLogs.subject,
        templateSlug: emailLogs.templateSlug,
        variables: emailLogs.variables,
        status: emailLogs.status,
        provider: emailLogs.provider,
        providerMessageId: emailLogs.providerMessageId,
        errorMessage: emailLogs.errorMessage,
        tripId: emailLogs.tripId,
        contactId: emailLogs.contactId,
        activityId: emailLogs.activityId,
        sentAt: emailLogs.sentAt,
        createdAt: emailLogs.createdAt,
        createdBy: emailLogs.createdBy,
        category: emailTemplates.category,
      })
      .from(emailLogs)
      .leftJoin(
        emailTemplates,
        and(
          eq(emailLogs.templateSlug, emailTemplates.slug),
          or(
            eq(emailTemplates.agencyId, agencyId),
            isNull(emailTemplates.agencyId)
          )
        )
      )
      .where(whereClause)
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset)

    return {
      data: logs.map((log) => this.mapToEmailLogResponseFromJoin(log)),
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
      category: null,
    }
  }

  /**
   * Map joined query row (with template category, no body fields) to response DTO
   */
  private mapToEmailLogResponseFromJoin(log: any): EmailLogResponse {
    return {
      id: log.id,
      agencyId: log.agencyId,
      toEmail: log.toEmail,
      ccEmail: log.ccEmail,
      bccEmail: log.bccEmail,
      fromEmail: log.fromEmail,
      replyTo: log.replyTo,
      subject: log.subject,
      bodyHtml: null,
      bodyText: null,
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
      category: (log.category as EmailCategory) || null,
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
  // SMTP routing helpers
  // ==========================================================================

  /**
   * Resolve the agent for SMTP routing via waterfall:
   * 1. contactId → contacts.ownerId
   * 2. tripId → trips.ownerId
   * 3. createdBy
   *
   * Then look up their active email account.
   */
  private async resolveAgent(
    agencyId: string,
    options: { contactId?: string; tripId?: string; createdBy?: string },
  ): Promise<{
    userId: string
    emailAccountId: string | null
    emailAddress: string | null
    displayName: string | null
  } | null> {
    if (!this.emailAccountsService) return null

    let agentUserId: string | null = null

    if (options.contactId) {
      const [contact] = await this.db.client
        .select({ ownerId: this.db.schema.contacts.ownerId })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, options.contactId))
        .limit(1)
      agentUserId = contact?.ownerId ?? null
    }

    if (!agentUserId && options.tripId) {
      const [trip] = await this.db.client
        .select({ ownerId: this.db.schema.trips.ownerId })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, options.tripId))
        .limit(1)
      agentUserId = trip?.ownerId ?? null
    }

    if (!agentUserId && options.createdBy) {
      agentUserId = options.createdBy
    }

    if (!agentUserId) return null

    // Look up agent's profile email (for replyTo when no SMTP account)
    const [profile] = await this.db.client
      .select({ email: this.db.schema.userProfiles.email })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, agentUserId))
      .limit(1)

    const account = await this.emailAccountsService.findActiveAccountForUser(
      agentUserId,
      agencyId,
    )

    return {
      userId: agentUserId,
      emailAccountId: account?.id ?? null,
      emailAddress: account?.emailAddress ?? profile?.email ?? null,
      displayName: account?.displayName ?? null,
    }
  }

  /**
   * Load agent signature and agency compliance footer for buildEmailBody.
   */
  private async loadSignatureAndFooter(
    agencyId: string,
    agentUserId?: string,
  ): Promise<{ signatureHtml: string | null; complianceFooter: string | null }> {
    let signatureHtml: string | null = null

    if (agentUserId) {
      const [userProfile] = await this.db.client
        .select({
          emailSignatureConfig: this.db.schema.userProfiles.emailSignatureConfig,
        })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, agentUserId))
        .limit(1)

      const sigConfig = userProfile?.emailSignatureConfig as any
      signatureHtml =
        sigConfig?.enabled && sigConfig?.signatureHtml
          ? sigConfig.signatureHtml
          : null
    }

    const [settings] = await this.db.client
      .select({
        emailComplianceFooter:
          this.db.schema.agencySettings.emailComplianceFooter,
      })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    return {
      signatureHtml,
      complianceFooter: settings?.emailComplianceFooter || null,
    }
  }

  /**
   * Match recipient email addresses to contacts in the agency.
   */
  private async matchRecipientContacts(
    agencyId: string,
    addresses: string[],
  ): Promise<string[]> {
    if (addresses.length === 0) return []

    const lowered = addresses.map((a) => a.toLowerCase())
    const results = await this.db.client
      .select({ id: this.db.schema.contacts.id })
      .from(this.db.schema.contacts)
      .where(
        sql`${this.db.schema.contacts.agencyId} = ${agencyId} AND lower(${this.db.schema.contacts.email}) IN (${sql.join(
          lowered.map((a) => sql`${a}`),
          sql`, `,
        )})`,
      )

    return results.map((r) => r.id)
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

  async sendTripReassignmentEmail(
    email: string,
    tripName: string,
    adminName: string,
    contactsAssigned: number,
    tripUrl: string,
    agencyId: string,
  ): Promise<void> {
    const html = getTripReassignmentTemplate({ tripName, adminName, contactsAssigned, tripUrl })
    await this.sendEmail({
      to: [email],
      subject: `Trip Assigned to You — ${tripName}`,
      html,
      agencyId,
      templateSlug: 'trip-reassignment',
    })
    this.logger.log(`Trip reassignment email sent to ${email}`)
  }

  async sendBulkReassignmentEmail(
    email: string,
    adminName: string,
    tripCount: number,
    tripNames: string[],
    contactsAssigned: number,
    contactsSkipped: number,
    tripsUrl: string,
    agencyId: string,
  ): Promise<void> {
    const html = getTripBulkReassignmentTemplate({ adminName, tripCount, tripNames, contactsAssigned, contactsSkipped, tripsUrl })
    await this.sendEmail({
      to: [email],
      subject: `${tripCount} Trips Assigned to You`,
      html,
      agencyId,
      templateSlug: 'trip-bulk-reassignment',
    })
    this.logger.log(`Bulk reassignment email sent to ${email}`)
  }
}
