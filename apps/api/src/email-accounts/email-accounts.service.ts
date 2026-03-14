import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { EncryptionService } from '../common/encryption/encryption.service'
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

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    userId: string,
    agencyId: string,
    dto: CreateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    // Validate domain against agency allowed domains
    await this.validateDomain(agencyId, dto.emailAddress)

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
        imapHost: dto.imapHost,
        imapPort: dto.imapPort ?? 993,
        imapTls: dto.imapTls ?? true,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort ?? 465,
        smtpTls: dto.smtpTls ?? true,
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

    // Re-encrypt if credentials changed
    if (dto.username !== undefined || dto.password !== undefined) {
      const current = await this.getDecryptedCredentials(id)
      const encrypted = this.encryptionService.encryptObject({
        username: dto.username ?? current.username,
        password: dto.password ?? current.password,
      })
      updateData.credentials = encrypted
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

  async findAllActive(): Promise<{ id: string; userId: string; agencyId: string }[]> {
    return this.db.client
      .select({
        id: this.db.schema.emailAccounts.id,
        userId: this.db.schema.emailAccounts.userId,
        agencyId: this.db.schema.emailAccounts.agencyId,
      })
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.isActive, true))
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

    const folder = filters.folder || 'INBOX'
    const page = filters.page ?? 1
    const limit = filters.limit ?? 50
    const offset = (page - 1) * limit

    const conditions = [
      eq(this.db.schema.syncedEmails.emailAccountId, accountId),
      eq(this.db.schema.syncedEmails.folder, folder),
    ]

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
      conditions.push(
        sql`${this.db.schema.syncedEmails.matchedContactIds} @> ${JSON.stringify([filters.contactId])}::jsonb`,
      )
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

    return {
      emails: emails.map((e) => this.formatEmailResponse(e)),
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
    return this.formatEmailResponse(updated)
  }

  async deleteEmail(
    accountId: string,
    emailId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(accountId, userId)

    const result = await this.db.client
      .delete(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.id, emailId),
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
        ),
      )
      .returning({ id: this.db.schema.syncedEmails.id })

    if (result.length === 0) throw new NotFoundException('Email not found')
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
