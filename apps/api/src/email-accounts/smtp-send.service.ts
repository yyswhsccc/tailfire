import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, sql } from 'drizzle-orm'
import * as nodemailer from 'nodemailer'
import { DatabaseService } from '../db/database.service'
import { EncryptionService } from '../common/encryption/encryption.service'
import { EmailAccountsService } from './email-accounts.service'
import { SendEmailDto } from './dto/send-email.dto'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types'

@Injectable()
export class SmtpSendService {
  private readonly logger = new Logger(SmtpSendService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionService: EncryptionService,
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
    const signature =
      signatureConfig?.enabled && signatureConfig?.signatureHtml
        ? signatureConfig.signatureHtml
        : ''

    // Load compliance footer from agency settings
    const [settings] = await this.db.client
      .select({ emailComplianceFooter: this.db.schema.agencySettings.emailComplianceFooter })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, account.agencyId))
      .limit(1)

    const footer = settings?.emailComplianceFooter || ''

    // Build HTML body: user content + signature + footer
    let fullBodyHtml = dto.bodyHtml
    if (signature) {
      fullBodyHtml += '<br><div class="email-signature">' + signature + '</div>'
    }
    if (footer) {
      fullBodyHtml += '<hr style="border:none;border-top:1px solid #ccc;margin:20px 0">'
      fullBodyHtml += '<div class="email-footer" style="font-size:11px;color:#666">' + footer + '</div>'
    }

    // Filter recipients in non-production
    const filteredTo = this.filterRecipientsForNonProd(dto.to.map((t) => t.address))
    const filteredCc = this.filterRecipientsForNonProd((dto.cc ?? []).map((t) => t.address))
    const filteredBcc = this.filterRecipientsForNonProd((dto.bcc ?? []).map((t) => t.address))

    if (filteredTo.length === 0 && filteredCc.length === 0 && filteredBcc.length === 0) {
      this.logger.warn(
        `All recipients filtered out in non-prod for account ${accountId}. No email sent.`,
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
          imapUid: 0, // Outbound — no IMAP UID
          folder: 'Sent',
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
    const allowedDomains = ['phoenixvoyages.ca']
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
