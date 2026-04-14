import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq, sql } from 'drizzle-orm'
import * as nodemailer from 'nodemailer'
import { assertPublicHost } from '../common/guards/assert-public-host'
import { DatabaseService } from '../db/database.service'
import { EmailAccountsService } from './email-accounts.service'
import { SendEmailDto } from './dto/send-email.dto'
import { buildEmailBody } from '../common/email/build-email-body'
// StorageService not directly available in this module (circular dep).
// Attachment downloads will be handled via a dedicated attachment service in Phase 2.
import type { SyncedEmailResponseDto } from '@tailfire/shared-types'

@Injectable()
export class SmtpSendService {
  private readonly logger = new Logger(SmtpSendService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly emailAccountsService: EmailAccountsService,
    private readonly configService: ConfigService,
  ) {}

  async send(
    accountId: string,
    dto: SendEmailDto,
    userId: string,
  ): Promise<SyncedEmailResponseDto> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    // Load user signature
    const [userProfile] = await this.db.client
      .select()
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    const signatureConfig = userProfile?.emailSignatureConfig as any
    const signatureHtml =
      signatureConfig?.enabled && signatureConfig?.signatureHtml
        ? signatureConfig.signatureHtml
        : null

    // Load compliance footer from agency settings
    const [settings] = await this.db.client
      .select({ emailComplianceFooter: this.db.schema.agencySettings.emailComplianceFooter })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, account.agencyId))
      .limit(1)

    const complianceFooter = settings?.emailComplianceFooter || null

    // Build HTML body: user content + signature + footer
    const fullBodyHtml = buildEmailBody(dto.bodyHtml, { signatureHtml, complianceFooter })

    // Filter recipients in non-production
    const filteredTo = this.filterRecipientsForNonProd(dto.to.map((t) => t.address))
    const filteredCc = this.filterRecipientsForNonProd((dto.cc ?? []).map((t) => t.address))
    const filteredBcc = this.filterRecipientsForNonProd((dto.bcc ?? []).map((t) => t.address))

    if (filteredTo.length === 0 && filteredCc.length === 0 && filteredBcc.length === 0) {
      this.logger.warn(
        `All recipients filtered out in non-prod for account ${accountId}. No email sent.`,
      )
      throw new BadRequestException(
        'No eligible recipients — in non-production, only @phoenixvoyages.ca addresses are allowed.',
      )
    }

    // Build threading headers
    let inReplyTo: string | undefined
    let references: string | undefined
    if (dto.inReplyToEmailId) {
      const [original] = await this.db.client
        .select({
          messageId: this.db.schema.syncedEmails.messageId,
          referencesHeader: this.db.schema.syncedEmails.referencesHeader,
        })
        .from(this.db.schema.syncedEmails)
        .where(eq(this.db.schema.syncedEmails.id, dto.inReplyToEmailId))
        .limit(1)

      if (original?.messageId) {
        inReplyTo = original.messageId
        references = original.referencesHeader
          ? `${original.referencesHeader} ${original.messageId}`
          : original.messageId
      }
    }

    // Validate SMTP host resolves to a public IP
    await assertPublicHost(account.smtpHost)

    // Create Nodemailer transport
    const transport = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpTls,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    })

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: account.displayName
          ? `"${account.displayName}" <${account.emailAddress}>`
          : account.emailAddress,
        to: filteredTo,
        cc: filteredCc.length > 0 ? filteredCc : undefined,
        bcc: filteredBcc.length > 0 ? filteredBcc : undefined,
        subject: dto.subject,
        html: fullBodyHtml,
        headers: {
          ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
          ...(references ? { References: references } : {}),
        },
      }

      if (dto.attachments && dto.attachments.length > 0) {
        // Attachment download requires StorageService which has a deep dependency chain
        // (StorageProviderFactory → CredentialResolverService) that creates circular deps
        // when imported directly into EmailAccountsModule. Attachment sending will be
        // implemented via a dedicated service that can access the storage layer.
        this.logger.warn(`${dto.attachments.length} attachment(s) specified but attachment sending not yet implemented`)
      }

      const info = await transport.sendMail(mailOptions)

      // Save to synced_emails as outbound
      const matchedContactIds = await this.matchRecipientContacts(
        account.agencyId,
        [...filteredTo, ...filteredCc, ...filteredBcc],
      )

      const [saved] = await this.db.client
        .insert(this.db.schema.syncedEmails)
        .values({
          emailAccountId: accountId,
          agencyId: account.agencyId,
          messageId: info.messageId,
          imapUid: null, // Outbound — no IMAP UID (excluded from unique partial index)
          folder: await this.resolveSentFolder(accountId),
          inReplyTo: inReplyTo ?? null,
          referencesHeader: references ?? null,
          fromAddress: account.emailAddress,
          fromName: account.displayName,
          toAddresses: dto.to,
          ccAddresses: dto.cc ?? [],
          bccAddresses: dto.bcc ?? [],
          subject: dto.subject,
          date: new Date(),
          bodyHtml: fullBodyHtml,
          bodyText: null,
          snippet: dto.bodyHtml.replace(/<[^>]+>/g, '').substring(0, 200).trim(),
          isSeen: true,
          isOutbound: true,
          matchedContactIds,
        })
        .returning()

      return this.formatEmailResponse(saved!)
    } catch (error: any) {
      // Never log credentials
      this.logger.error(`SMTP send failed for account ${accountId}: ${error.message}`)
      throw error
    } finally {
      transport.close()
    }
  }

  /**
   * Lightweight SMTP send with pre-built content.
   * Does NOT: build body, filter domains, load signature/footer, log, or save to synced_emails.
   * All of that is the caller's responsibility (enables double-send prevention).
   */
  async sendRaw(options: {
    accountId: string
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    html: string
    text?: string
    replyTo?: string
    attachments?: { filename: string; content: Buffer | string; contentType?: string }[]
  }): Promise<{ messageId: string }> {
    const account = await this.emailAccountsService.getAccountById(options.accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(options.accountId)

    await assertPublicHost(account.smtpHost)

    const transport = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpTls,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    })

    try {
      const info = await transport.sendMail({
        from: options.from,
        to: options.to,
        cc: options.cc?.length ? options.cc : undefined,
        bcc: options.bcc?.length ? options.bcc : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      })

      return { messageId: info.messageId }
    } finally {
      transport.close()
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private isProduction(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV')
    const railwayEnv = this.configService.get<string>('RAILWAY_ENVIRONMENT')
    return nodeEnv === 'production' || railwayEnv === 'production'
  }

  private filterRecipientsForNonProd(recipients: string[]): string[] {
    if (this.isProduction()) return recipients
    const allowedDomains = ['phoenixvoyages.ca', 'kaponline.com']
    const filtered = recipients.filter((r) =>
      allowedDomains.some((d) => r.toLowerCase().endsWith(`@${d}`)),
    )
    if (filtered.length < recipients.length) {
      this.logger.warn(
        `Non-prod: filtered ${recipients.length - filtered.length} recipients outside allowed domains`,
      )
    }
    return filtered
  }

  /**
   * Resolve the Sent folder path for an account by checking existing synced emails.
   * Falls back to common conventions if no sent mail has been synced yet.
   */
  private async resolveSentFolder(accountId: string): Promise<string> {
    // Check if we already have outbound emails — use the same folder
    const [existing] = await this.db.client
      .select({ folder: this.db.schema.syncedEmails.folder })
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
          eq(this.db.schema.syncedEmails.isOutbound, true),
        ),
      )
      .limit(1)

    if (existing?.folder) return existing.folder

    // Check sync state for known folder paths containing "Sent"
    const account = await this.emailAccountsService.getAccountById(accountId)
    const syncState = (account.syncState as any) ?? {}
    const folderKeys = Object.keys(syncState.folders ?? {})
    const sentFolder = folderKeys.find(
      (k) => k.toLowerCase().includes('sent') && !k.toLowerCase().includes('junk'),
    )
    if (sentFolder) return sentFolder

    // Default: cPanel/Dovecot convention
    return 'INBOX.Sent'
  }

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

  private formatEmailResponse(email: any): SyncedEmailResponseDto {
    return {
      id: email.id,
      emailAccountId: email.emailAccountId,
      messageId: email.messageId,
      folder: email.folder,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      toAddresses: (email.toAddresses as any[]) ?? [],
      ccAddresses: (email.ccAddresses as any[]) ?? [],
      subject: email.subject,
      date: email.date?.toISOString() ?? null,
      snippet: email.snippet,
      isSeen: email.isSeen,
      isFlagged: email.isFlagged,
      isAnswered: email.isAnswered,
      isDraft: email.isDraft,
      isOutbound: email.isOutbound,
      hasAttachments: email.hasAttachments,
      matchedContactIds: (email.matchedContactIds as string[]) ?? [],
      threadId: email.threadId,
      syncedAt: email.syncedAt.toISOString(),
    }
  }
}
