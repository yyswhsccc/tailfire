import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { eq, and, ne, sql, desc, asc, ilike, or } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { EncryptionService } from '../common/encryption/encryption.service'
import { QUEUES } from '../automation/automation.types'
import { ImapWriteService } from './imap-write.service'
import { CreateEmailAccountDto } from './dto/create-email-account.dto'
import { UpdateEmailAccountDto } from './dto/update-email-account.dto'
import { EmailFilterDto } from './dto/email-filter.dto'
import type {
  EmailAccountResponseDto,
  SyncedEmailResponseDto,
  SyncedEmailDetailDto,
  EmailAttachmentDto,
} from '@tailfire/shared-types'

@Injectable()
export class EmailAccountsService {
  private readonly logger = new Logger(EmailAccountsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionService: EncryptionService,
    @InjectQueue(QUEUES.EMAIL_WRITEBACK) private readonly writebackQueue: Queue,
    private readonly imapWriteService: ImapWriteService,
  ) {}

  // Server defaults per email domain — enforced server-side regardless of client input
  private static readonly DOMAIN_SERVER_DEFAULTS: Record<string, {
    imapHost: string; imapPort: number; imapTls: boolean
    smtpHost: string; smtpPort: number; smtpTls: boolean
  }> = {
    'phoenixvoyages.ca': {
      imapHost: 'mail.phoenixvoyages.ca',
      imapPort: 993,
      imapTls: true,
      smtpHost: 'mail.phoenixvoyages.ca',
      smtpPort: 465,
      smtpTls: true,
    },
  }

  async create(
    userId: string,
    agencyId: string,
    dto: CreateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    // Validate domain against agency allowed domains
    await this.validateDomain(agencyId, dto.emailAddress)

    // Override server settings with domain defaults if available
    const domain = dto.emailAddress.split('@')[1]?.toLowerCase()
    const domainDefaults = domain ? EmailAccountsService.DOMAIN_SERVER_DEFAULTS[domain] : undefined

    // Encrypt credentials
    const encrypted = this.encryptionService.encryptObject({
      username: dto.username,
      password: dto.password,
    })

    const [account] = await this.db.client
      .insert(this.db.schema.emailAccounts)
      .values({
        userId,
        agencyId,
        emailAddress: dto.emailAddress,
        displayName: dto.displayName,
        imapHost: domainDefaults?.imapHost ?? dto.imapHost,
        imapPort: domainDefaults?.imapPort ?? dto.imapPort ?? 993,
        imapTls: domainDefaults?.imapTls ?? dto.imapTls ?? true,
        smtpHost: domainDefaults?.smtpHost ?? dto.smtpHost,
        smtpPort: domainDefaults?.smtpPort ?? dto.smtpPort ?? 465,
        smtpTls: domainDefaults?.smtpTls ?? dto.smtpTls ?? true,
        credentials: encrypted,
      })
      .returning()

    return this.formatAccountResponse(account!)
  }

  async findAllForUser(userId: string): Promise<EmailAccountResponseDto[]> {
    const accounts = await this.db.client
      .select()
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.userId, userId))
      .orderBy(desc(this.db.schema.emailAccounts.createdAt))

    return accounts.map((a) => this.formatAccountResponse(a))
  }

  async findOne(id: string, userId: string): Promise<EmailAccountResponseDto> {
    const [account] = await this.db.client
      .select()
      .from(this.db.schema.emailAccounts)
      .where(
        and(
          eq(this.db.schema.emailAccounts.id, id),
          eq(this.db.schema.emailAccounts.userId, userId),
        ),
      )
      .limit(1)

    if (!account) {
      throw new NotFoundException('Email account not found')
    }

    return this.formatAccountResponse(account)
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    // Verify ownership
    await this.findOne(id, userId)

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (dto.displayName !== undefined) updateData.displayName = dto.displayName
    if (dto.imapHost !== undefined) updateData.imapHost = dto.imapHost
    if (dto.imapPort !== undefined) updateData.imapPort = dto.imapPort
    if (dto.imapTls !== undefined) updateData.imapTls = dto.imapTls
    if (dto.smtpHost !== undefined) updateData.smtpHost = dto.smtpHost
    if (dto.smtpPort !== undefined) updateData.smtpPort = dto.smtpPort
    if (dto.smtpTls !== undefined) updateData.smtpTls = dto.smtpTls
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive

    // Re-encrypt if credentials changed, and clear auth error to re-enable sync
    if (dto.username !== undefined || dto.password !== undefined) {
      const current = await this.getDecryptedCredentials(id)
      const encrypted = this.encryptionService.encryptObject({
        username: dto.username ?? current.username,
        password: dto.password ?? current.password,
      })
      updateData.credentials = encrypted
      updateData.lastSyncError = null
    }

    const [updated] = await this.db.client
      .update(this.db.schema.emailAccounts)
      .set(updateData)
      .where(
        and(
          eq(this.db.schema.emailAccounts.id, id),
          eq(this.db.schema.emailAccounts.userId, userId),
        ),
      )
      .returning()

    return this.formatAccountResponse(updated!)
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId)

    await this.db.client
      .update(this.db.schema.emailAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(this.db.schema.emailAccounts.id, id),
          eq(this.db.schema.emailAccounts.userId, userId),
        ),
      )
  }

  async getDecryptedCredentials(accountId: string): Promise<{ username: string; password: string }> {
    const [account] = await this.db.client
      .select({ credentials: this.db.schema.emailAccounts.credentials })
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.id, accountId))
      .limit(1)

    if (!account) {
      throw new NotFoundException('Email account not found')
    }

    return this.encryptionService.decryptObject(account.credentials as any)
  }

  async getAccountById(accountId: string) {
    const [account] = await this.db.client
      .select()
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.id, accountId))
      .limit(1)

    if (!account) {
      throw new NotFoundException('Email account not found')
    }

    return account
  }

  /**
   * Find the primary active email account for a user within an agency.
   * Returns the oldest active account (deterministic selection by createdAt ASC).
   * Returns null if no active account exists.
   */
  async findActiveAccountForUser(
    userId: string,
    agencyId: string,
  ) {
    const [account] = await this.db.client
      .select()
      .from(this.db.schema.emailAccounts)
      .where(
        and(
          eq(this.db.schema.emailAccounts.userId, userId),
          eq(this.db.schema.emailAccounts.agencyId, agencyId),
          eq(this.db.schema.emailAccounts.isActive, true),
        ),
      )
      .orderBy(asc(this.db.schema.emailAccounts.createdAt))
      .limit(1)

    return account || null
  }

  async findAllActive(): Promise<{ id: string; userId: string; agencyId: string }[]> {
    return this.db.client
      .select({
        id: this.db.schema.emailAccounts.id,
        userId: this.db.schema.emailAccounts.userId,
        agencyId: this.db.schema.emailAccounts.agencyId,
      })
      .from(this.db.schema.emailAccounts)
      .where(
        and(
          eq(this.db.schema.emailAccounts.isActive, true),
          or(
            sql`${this.db.schema.emailAccounts.lastSyncError} IS NULL`,
            // Exclude accounts with persistent failures (auth or connection)
            // These need user action (password reset, host fix) before retrying
            sql`${this.db.schema.emailAccounts.lastSyncError} NOT LIKE 'IMAP_AUTH_%' AND ${this.db.schema.emailAccounts.lastSyncError} NOT LIKE 'IMAP_CONNECTION_%'`,
          ),
        ),
      )
  }

  async updateSyncState(
    accountId: string,
    syncState: Record<string, unknown>,
    lastSyncError?: string | null,
  ): Promise<void> {
    await this.db.client
      .update(this.db.schema.emailAccounts)
      .set({
        syncState,
        lastSyncAt: new Date(),
        lastSyncError: lastSyncError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.emailAccounts.id, accountId))
  }

  // ============================================================================
  // Email listing
  // ============================================================================

  async listEmails(
    accountId: string,
    userId: string,
    filters: EmailFilterDto,
  ): Promise<{ emails: SyncedEmailResponseDto[]; total: number }> {
    // Verify ownership
    await this.findOne(accountId, userId)

    const page = filters.page ?? 1
    const limit = filters.limit ?? 50
    const offset = (page - 1) * limit

    const conditions = [
      eq(this.db.schema.syncedEmails.emailAccountId, accountId),
    ]

    // When filtering by contactId, search across all folders;
    // otherwise scope to a specific folder (default INBOX)
    if (!filters.contactId) {
      const folder = filters.folder || 'INBOX'
      conditions.push(eq(this.db.schema.syncedEmails.folder, folder))
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(this.db.schema.syncedEmails.subject, `%${filters.search}%`),
          ilike(this.db.schema.syncedEmails.fromAddress, `%${filters.search}%`),
          ilike(this.db.schema.syncedEmails.fromName, `%${filters.search}%`),
        )!,
      )
    }

    if (filters.contactId) {
      // Look up the contact's email address for a fallback match
      const [contact] = await this.db.client
        .select({ email: this.db.schema.contacts.email })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, filters.contactId))

      const contactEmail = contact?.email?.toLowerCase()

      if (contactEmail) {
        // Match by either matchedContactIds OR email address (from/to/cc)
        conditions.push(
          or(
            sql`${this.db.schema.syncedEmails.matchedContactIds} @> ${JSON.stringify([filters.contactId])}::jsonb`,
            ilike(this.db.schema.syncedEmails.fromAddress, contactEmail),
            sql`EXISTS (
              SELECT 1 FROM jsonb_array_elements(${this.db.schema.syncedEmails.toAddresses}) AS addr
              WHERE lower(addr->>'address') = ${contactEmail}
            )`,
          )!,
        )
      } else {
        conditions.push(
          sql`${this.db.schema.syncedEmails.matchedContactIds} @> ${JSON.stringify([filters.contactId])}::jsonb`,
        )
      }
    }

    const whereClause = and(...conditions)

    const [countResult, emails] = await Promise.all([
      this.db.client
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(this.db.schema.syncedEmails)
        .where(whereClause),
      this.db.client
        .select()
        .from(this.db.schema.syncedEmails)
        .where(whereClause)
        .orderBy(desc(this.db.schema.syncedEmails.date))
        .limit(limit)
        .offset(offset),
    ])

    // Batch-resolve sender display names from CRM contacts
    const [accountRow] = await this.db.client
      .select({ agencyId: this.db.schema.emailAccounts.agencyId })
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.id, accountId))
      .limit(1)

    const resolvedFromNameMap = new Map<string, string>()

    if (accountRow && emails.length > 0) {
      const uniqueAddresses = [
        ...new Set(
          emails
            .map((e) => e.fromAddress?.toLowerCase())
            .filter((a): a is string => Boolean(a)),
        ),
      ]

      if (uniqueAddresses.length > 0) {
        const matchedContacts = await this.db.client
          .select({
            email: this.db.schema.contacts.email,
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
          })
          .from(this.db.schema.contacts)
          .where(
            and(
              eq(this.db.schema.contacts.agencyId, accountRow.agencyId),
              sql`LOWER(${this.db.schema.contacts.email}) IN (${sql.join(
                uniqueAddresses.map((a) => sql`${a}`),
                sql`, `,
              )})`,
            ),
          )

        for (const contact of matchedContacts) {
          if (contact.email) {
            const fullName = [contact.firstName, contact.lastName]
              .filter(Boolean)
              .join(' ')
            if (fullName) {
              resolvedFromNameMap.set(contact.email.toLowerCase(), fullName)
            }
          }
        }
      }
    }

    return {
      emails: emails.map((e) =>
        this.formatEmailResponse(e, resolvedFromNameMap),
      ),
      total: countResult[0]?.count ?? 0,
    }
  }

  async getEmailDetail(
    accountId: string,
    emailId: string,
    userId: string,
  ): Promise<SyncedEmailDetailDto> {
    await this.findOne(accountId, userId)

    const [email] = await this.db.client
      .select()
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .limit(1)

    if (!email) {
      throw new NotFoundException('Email not found')
    }

    const attachments = await this.db.client
      .select()
      .from(this.db.schema.emailAttachments)
      .where(eq(this.db.schema.emailAttachments.emailId, emailId))

    return {
      ...this.formatEmailResponse(email),
      bccAddresses: (email.bccAddresses as any[]) ?? [],
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      inReplyTo: email.inReplyTo,
      referencesHeader: email.referencesHeader,
      sizeBytes: email.sizeBytes,
      attachments: attachments.map((a) => this.formatAttachment(a)),
    }
  }

  // ============================================================================
  // Email actions
  // ============================================================================

  async updateEmailFlags(
    accountId: string,
    emailId: string,
    userId: string,
    flags: { isSeen?: boolean; isFlagged?: boolean },
  ): Promise<SyncedEmailResponseDto> {
    await this.findOne(accountId, userId)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (flags.isSeen !== undefined) updateData.isSeen = flags.isSeen
    if (flags.isFlagged !== undefined) updateData.isFlagged = flags.isFlagged

    const [updated] = await this.db.client
      .update(this.db.schema.syncedEmails)
      .set(updateData)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .returning()

    if (!updated) throw new NotFoundException('Email not found')

    // Queue IMAP flag write-back (fire-and-forget)
    // Only for inbound emails with a valid IMAP UID
    const emailRow = await this.db.client
      .select({
        imapUid: this.db.schema.syncedEmails.imapUid,
        folder: this.db.schema.syncedEmails.folder,
        isOutbound: this.db.schema.syncedEmails.isOutbound,
      })
      .from(this.db.schema.syncedEmails)
      .where(eq(this.db.schema.syncedEmails.id, emailId))
      .limit(1)

    const email = emailRow[0]
    if (email?.imapUid && !email.isOutbound) {
      this.writebackQueue
        .add('email.writeback.flags', {
          type: 'flags',
          accountId,
          uid: email.imapUid,
          folder: email.folder,
          flags,
        })
        .catch((err) =>
          this.logger.warn(`Failed to queue flag writeback: ${err.message}`),
        )
    }

    return this.formatEmailResponse(updated)
  }

  async deleteEmail(
    accountId: string,
    emailId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(accountId, userId)

    // 1. Get email details
    const [email] = await this.db.client
      .select({
        id: this.db.schema.syncedEmails.id,
        imapUid: this.db.schema.syncedEmails.imapUid,
        folder: this.db.schema.syncedEmails.folder,
        isOutbound: this.db.schema.syncedEmails.isOutbound,
      })
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .limit(1)

    if (!email) throw new NotFoundException('Email not found')

    // 2. IMAP delete first (move to Trash) if has UID and not outbound
    if (email.imapUid && !email.isOutbound) {
      try {
        await this.imapWriteService.deleteMessage(accountId, email.imapUid, email.folder)
      } catch (err: any) {
        this.logger.error(`IMAP delete failed: ${err.message}`)
        throw new HttpException('Failed to delete email on mail server', HttpStatus.BAD_GATEWAY)
      }
    }

    // 3. Delete from DB only after IMAP succeeds
    await this.db.client
      .delete(this.db.schema.syncedEmails)
      .where(eq(this.db.schema.syncedEmails.id, emailId))
  }

  async moveEmail(
    accountId: string,
    emailId: string,
    userId: string,
    targetFolder: string,
  ): Promise<void> {
    await this.findOne(accountId, userId)

    // 1. Get email details
    const [email] = await this.db.client
      .select({
        id: this.db.schema.syncedEmails.id,
        imapUid: this.db.schema.syncedEmails.imapUid,
        folder: this.db.schema.syncedEmails.folder,
        isOutbound: this.db.schema.syncedEmails.isOutbound,
      })
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .limit(1)

    if (!email) throw new NotFoundException('Email not found')

    // 2. IMAP move first (if has UID and not outbound)
    let newUid = email.imapUid
    if (email.imapUid && !email.isOutbound) {
      try {
        const result = await this.imapWriteService.moveMessage(
          accountId,
          email.imapUid,
          email.folder,
          targetFolder,
        )
        newUid = result.newUid ?? email.imapUid
      } catch (err: any) {
        this.logger.error(`IMAP move failed: ${err.message}`)
        throw new HttpException('Failed to move email on mail server', HttpStatus.BAD_GATEWAY)
      }
    }

    // 3. Update DB only after IMAP succeeds
    await this.db.client
      .update(this.db.schema.syncedEmails)
      .set({
        folder: targetFolder,
        imapUid: newUid,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.syncedEmails.id, emailId))
  }

  async batchUpdateFlags(
    accountId: string,
    userId: string,
    emailIds: string[],
    flags: { isSeen?: boolean; isFlagged?: boolean },
  ): Promise<void> {
    await this.findOne(accountId, userId)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (flags.isSeen !== undefined) updateData.isSeen = flags.isSeen
    if (flags.isFlagged !== undefined) updateData.isFlagged = flags.isFlagged

    await this.db.client
      .update(this.db.schema.syncedEmails)
      .set(updateData)
      .where(
        and(
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
          sql`${this.db.schema.syncedEmails.id} IN (${sql.join(emailIds.map(id => sql`${id}`), sql`, `)})`,
        ),
      )
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async validateDomain(agencyId: string, emailAddress: string): Promise<void> {
    const [settings] = await this.db.client
      .select({ emailAllowedDomains: this.db.schema.agencySettings.emailAllowedDomains })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    const allowedDomains = (settings?.emailAllowedDomains as string[]) ?? []
    if (allowedDomains.length > 0) {
      const domain = emailAddress.split('@')[1]?.toLowerCase() ?? ''
      if (!domain || !allowedDomains.includes(domain)) {
        throw new BadRequestException(
          `Only emails from allowed domains can be added: ${allowedDomains.join(', ')}`,
        )
      }
    }
  }

  async getEmailAllowedDomains(agencyId: string): Promise<string[]> {
    const [settings] = await this.db.client
      .select({ emailAllowedDomains: this.db.schema.agencySettings.emailAllowedDomains })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    return (settings?.emailAllowedDomains as string[]) ?? []
  }

  private formatAccountResponse(account: any): EmailAccountResponseDto {
    return {
      id: account.id,
      userId: account.userId,
      emailAddress: account.emailAddress,
      displayName: account.displayName,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapTls: account.imapTls,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpTls: account.smtpTls,
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      lastSyncError: account.lastSyncError,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }
  }

  private formatEmailResponse(
    email: any,
    resolvedFromNameMap?: Map<string, string>,
  ): SyncedEmailResponseDto {
    const resolvedFromName =
      resolvedFromNameMap && email.fromAddress
        ? (resolvedFromNameMap.get(email.fromAddress.toLowerCase()) ?? null)
        : null

    return {
      id: email.id,
      emailAccountId: email.emailAccountId,
      messageId: email.messageId,
      folder: email.folder,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      resolvedFromName,
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

  /**
   * Link a contact to an email by adding to matchedContactIds
   */
  async linkContact(accountId: string, emailId: string, contactId: string, _userId: string): Promise<void> {
    const [email] = await this.db.client
      .select({ id: this.db.schema.syncedEmails.id, matchedContactIds: this.db.schema.syncedEmails.matchedContactIds })
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .limit(1)

    if (!email) throw new NotFoundException('Email not found')

    const existing = (email.matchedContactIds as string[]) ?? []
    if (existing.includes(contactId)) return // Already linked

    await this.db.client
      .update(this.db.schema.syncedEmails)
      .set({
        matchedContactIds: [...existing, contactId],
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.syncedEmails.id, emailId))
  }

  private formatAttachment(attachment: any): EmailAttachmentDto {
    return {
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      isInline: attachment.isInline,
      storageUrl: attachment.storageUrl,
      isCached: attachment.isCached,
    }
  }
}
