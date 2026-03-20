import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common'
import { eq, and, sql, count, isNull } from 'drizzle-orm'
import { assertPublicHost } from '../common/guards/assert-public-host'
import { DatabaseService } from '../db/database.service'
import { EmailAccountsService } from './email-accounts.service'
import { NotificationService } from '../notifications/notification.service'
import type {
  TestConnectionResultDto,
  EmailFolderDto,
  SyncResultDto,
} from '@tailfire/shared-types'

@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly emailAccountsService: EmailAccountsService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Test IMAP connection with given credentials
   */
  async testConnection(dto: {
    imapHost: string
    imapPort: number
    imapTls: boolean
    username: string
    password: string
  }): Promise<TestConnectionResultDto> {
    try {
      const client = await this.createImapClient({
        host: dto.imapHost,
        port: dto.imapPort,
        secure: dto.imapTls,
        user: dto.username,
        pass: dto.password,
      })

      await client.connect()
      await client.logout()

      return { success: true }
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.warn(`IMAP connection test failed: ${detail}`)
      return { success: false, error: detail }
    }
  }

  /**
   * Sync an account — fetches new messages from IMAP and upserts into synced_emails.
   * Full implementation in Task 8.
   */
  async syncAccount(accountId: string): Promise<SyncResultDto> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    let newMessages = 0
    const errors: string[] = []
    const newSenders: string[] = []

    try {
      const client = await this.createImapClient({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapTls,
        user: credentials.username,
        pass: credentials.password,
      })

      await client.connect()

      // Sync INBOX (primary folder for Phase 1)
      const lock = await client.getMailboxLock('INBOX')
      try {
        const syncState = (account.syncState as any) ?? {}
        const folderState = syncState?.folders?.INBOX ?? {}
        const lastUid = folderState.lastUid ?? 0

        // Check if there are potentially new messages before fetching
        const mailboxStatus = client.mailbox
        const uidNext = mailboxStatus && typeof mailboxStatus === 'object'
          ? Number((mailboxStatus as any).uidNext)
          : undefined

        if (uidNext && uidNext <= lastUid + 1) {
          this.logger.debug(`No new messages in INBOX (uidNext=${uidNext}, lastUid=${lastUid})`)
        } else {
          // Fetch new messages (metadata only — no body)
          const fetchRange = lastUid > 0 ? `${lastUid + 1}:*` : '1:*'
          this.logger.debug(`Fetching UIDs ${fetchRange} from INBOX (lastUid=${lastUid}, uidNext=${uidNext})`)
          for await (const msg of client.fetch(fetchRange, {
            envelope: true,
            bodyStructure: true,
            flags: true,
            uid: true,
          })) {
            if (Number(msg.uid) <= lastUid) continue

            try {
              await this.upsertEmailFromImap(accountId, account.agencyId, 'INBOX', msg)
              newMessages++
              const from = msg.envelope?.from?.[0]
              if (from) {
                newSenders.push(from.name || from.address || 'Unknown')
              }
            } catch (err: any) {
              this.logger.error(`Failed to upsert UID ${msg.uid}: ${err.message}`, err.stack)
              errors.push(`UID ${msg.uid}: ${err.message}`)
            }
          }
        }

        // Update sync state
        const uidValidity = mailboxStatus && typeof mailboxStatus === 'object'
          ? Number((mailboxStatus as any).uidValidity)
          : undefined
        await this.emailAccountsService.updateSyncState(accountId, {
          ...syncState,
          folders: {
            ...syncState.folders,
            INBOX: {
              uidValidity,
              lastUid: uidNext ? uidNext - 1 : lastUid,
            },
          },
        })
      } finally {
        lock.release()
      }

      await client.logout()
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`Sync failed for account ${accountId}: ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId, (account.syncState as Record<string, unknown>) ?? {})
      await this.emailAccountsService.updateSyncState(
        accountId,
        (account.syncState as Record<string, unknown>) ?? {},
        error.message,
      )
      errors.push(error.message)
    }

    // Notify account owner of new emails
    if (newMessages > 0) {
      try {
        const title = newMessages === 1
          ? `New email from ${newSenders[0] || 'Unknown'}`
          : `${newMessages} new emails`
        const body = newMessages === 1
          ? `You received a new email from ${newSenders[0] || 'Unknown'}`
          : `You received ${newMessages} new emails from ${[...new Set(newSenders)].slice(0, 3).join(', ')}${newSenders.length > 3 ? ` and ${newSenders.length - 3} more` : ''}`

        await this.notificationService.send({
          userId: account.userId,
          category: 'client_care',
          title,
          body,
          actionUrl: '/emails/inbox',
          data: {
            notificationType: 'email.received',
            emailAccountId: accountId,
            newMessageCount: newMessages,
          },
        })
      } catch (err: any) {
        this.logger.warn(`Failed to send new email notification: ${err.message}`)
      }
    }

    return { newMessages, errors }
  }

  /**
   * Fetch full email body on demand (lazy load)
   */
  async fetchEmailBody(
    accountId: string,
    emailId: string,
  ): Promise<{ bodyHtml: string | null; bodyText: string | null; snippet: string | null }> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

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

    // Return cached body if already fetched (avoid redundant IMAP connection)
    if (email.bodyHtml || email.bodyText) {
      return {
        bodyHtml: email.bodyHtml,
        bodyText: email.bodyText,
        snippet: email.snippet,
      }
    }

    try {
      const client = await this.createImapClient({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapTls,
        user: credentials.username,
        pass: credentials.password,
      })

      await client.connect()
      const lock = await client.getMailboxLock(email.folder)

      try {
        const downloadResult = await client.download(String(email.imapUid), undefined, { uid: true })
        const chunks: Buffer[] = []
        for await (const chunk of downloadResult.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const rawMessage = Buffer.concat(chunks)

        // Parse with postal-mime
        const { default: PostalMime } = await import('postal-mime')
        const parser = new PostalMime()
        const parsed = await parser.parse(rawMessage)

        const bodyHtml = parsed.html || null
        const bodyText = parsed.text || null
        const snippet = bodyText ? bodyText.substring(0, 200).replace(/\s+/g, ' ').trim() : null

        // Update the email record with body content
        await this.db.client
          .update(this.db.schema.syncedEmails)
          .set({ bodyHtml, bodyText, snippet, updatedAt: new Date() })
          .where(eq(this.db.schema.syncedEmails.id, emailId))

        return { bodyHtml, bodyText, snippet }
      } finally {
        lock.release()
        await client.logout()
      }
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`Body fetch failed for email ${emailId}: ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId)
      throw error
    }
  }

  /**
   * List IMAP folders for an account
   */
  async listFolders(accountId: string): Promise<EmailFolderDto[]> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    try {
      const client = await this.createImapClient({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapTls,
        user: credentials.username,
        pass: credentials.password,
      })

      await client.connect()
      const mailboxes = await client.list()
      await client.logout()

      // Use local DB for unseen counts (flag updates are local-only)
      const localCounts = await this.db.client
        .select({
          folder: this.db.schema.syncedEmails.folder,
          total: count(),
          unseen: count(
            sql`CASE WHEN ${this.db.schema.syncedEmails.isSeen} = false THEN 1 END`,
          ),
        })
        .from(this.db.schema.syncedEmails)
        .where(eq(this.db.schema.syncedEmails.emailAccountId, accountId))
        .groupBy(this.db.schema.syncedEmails.folder)

      const countsByFolder = new Map(
        localCounts.map((r) => [r.folder, { total: r.total, unseen: r.unseen }]),
      )

      return mailboxes.map((mb) => ({
        name: mb.name,
        path: mb.path,
        specialUse: mb.specialUse || undefined,
        totalMessages: countsByFolder.get(mb.path)?.total ?? 0,
        unseenMessages: countsByFolder.get(mb.path)?.unseen ?? 0,
      }))
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`List folders failed for account ${accountId}: ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId, (account.syncState as Record<string, unknown>) ?? {})
      return []
    }
  }

  /**
   * Create an IMAP folder
   */
  async createFolder(accountId: string, path: string): Promise<void> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    const client = await this.createImapClient({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      user: credentials.username,
      pass: credentials.password,
    })

    await client.connect()
    try {
      await client.mailboxCreate(path)
    } finally {
      await client.logout()
    }
  }

  /**
   * Rename an IMAP folder
   */
  async renameFolder(accountId: string, path: string, newPath: string): Promise<void> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    const client = await this.createImapClient({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      user: credentials.username,
      pass: credentials.password,
    })

    await client.connect()
    try {
      await client.mailboxRename(path, newPath)
      // Update folder references in synced_emails
      await this.db.client
        .update(this.db.schema.syncedEmails)
        .set({ folder: newPath, updatedAt: new Date() })
        .where(
          and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            eq(this.db.schema.syncedEmails.folder, path),
          ),
        )
    } finally {
      await client.logout()
    }
  }

  /**
   * Delete an IMAP folder
   */
  async deleteFolder(accountId: string, path: string): Promise<void> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    const client = await this.createImapClient({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      user: credentials.username,
      pass: credentials.password,
    })

    await client.connect()
    try {
      await client.mailboxDelete(path)
      // Remove synced emails from deleted folder
      await this.db.client
        .delete(this.db.schema.syncedEmails)
        .where(
          and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            eq(this.db.schema.syncedEmails.folder, path),
          ),
        )
    } finally {
      await client.logout()
    }
  }

  /**
   * Move an email to a different IMAP folder
   */
  async moveEmail(
    accountId: string,
    emailId: string,
    destinationFolder: string,
  ): Promise<void> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

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

    if (!email) throw new NotFoundException('Email not found')
    if (!email.imapUid) throw new NotFoundException('Email has no IMAP UID (outbound email)')

    const client = await this.createImapClient({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      user: credentials.username,
      pass: credentials.password,
    })

    await client.connect()
    const lock = await client.getMailboxLock(email.folder)
    try {
      await client.messageMove(String(email.imapUid), destinationFolder, { uid: true })
      // Update the local DB record
      await this.db.client
        .update(this.db.schema.syncedEmails)
        .set({ folder: destinationFolder, updatedAt: new Date() })
        .where(eq(this.db.schema.syncedEmails.id, emailId))
    } finally {
      lock.release()
      await client.logout()
    }
  }

  /**
   * Fetch attachment content from IMAP (cache on first access)
   */
  async fetchAttachment(
    accountId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const [attachment] = await this.db.client
      .select()
      .from(this.db.schema.emailAttachments)
      .where(
        and(
          eq(this.db.schema.emailAttachments.id, attachmentId),
          eq(this.db.schema.emailAttachments.emailId, emailId),
        ),
      )
      .limit(1)

    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    // Attachments are fetched from IMAP on demand (not cached in storage yet)
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)
    const [email] = await this.db.client
      .select()
      .from(this.db.schema.syncedEmails)
      .where(eq(this.db.schema.syncedEmails.id, emailId))
      .limit(1)

    if (!email) {
      throw new NotFoundException('Email not found')
    }

    try {
      const client = await this.createImapClient({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapTls,
        user: credentials.username,
        pass: credentials.password,
      })

      await client.connect()
      const lock = await client.getMailboxLock(email.folder)

      try {
        const downloadResult = await client.download(
          String(email.imapUid),
          attachment.imapPartId || undefined,
          { uid: true },
        )
        const chunks: Buffer[] = []
        for await (const chunk of downloadResult.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }

        return {
          buffer: Buffer.concat(chunks),
          contentType: attachment.contentType ?? 'application/octet-stream',
          filename: attachment.filename ?? 'attachment',
        }
      } finally {
        lock.release()
        await client.logout()
      }
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`Attachment fetch failed for ${attachmentId}: ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId)
      throw error
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Check if an error is an IMAP authentication failure, mark the account,
   * and throw a typed HttpException.
   */
  private async handleImapAuthFailure(error: any, accountId: string, syncState?: Record<string, unknown>): Promise<void> {
    if (error.authenticationFailed || error.serverResponseCode === 'AUTHENTICATIONFAILED') {
      await this.emailAccountsService.updateSyncState(accountId, syncState ?? {}, 'IMAP_AUTH_FAILED')
      throw new HttpException(
        { statusCode: HttpStatus.BAD_GATEWAY, code: 'IMAP_AUTH_FAILED', message: 'Email authentication failed. Please update your email password.' },
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  /**
   * Create an ImapFlow client with an error handler to prevent unhandled
   * 'error' events (e.g. socket timeouts) from crashing the Node process.
   */
  private async createImapClient(config: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }) {
    await assertPublicHost(config.host)
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    })
    // Prevent unhandled 'error' event from crashing the process
    client.on('error', (err: Error) => {
      this.logger.warn(`ImapFlow error (${config.host}): ${err.message}`)
    })
    return client
  }

  private async upsertEmailFromImap(
    accountId: string,
    agencyId: string,
    folder: string,
    msg: any,
  ): Promise<void> {
    const envelope = msg.envelope
    const flags = msg.flags ?? new Set()

    // Extract addresses
    const from = envelope?.from?.[0]
    const toAddresses = (envelope?.to ?? []).map((a: any) => ({ address: a.address, name: a.name }))
    const ccAddresses = (envelope?.cc ?? []).map((a: any) => ({ address: a.address, name: a.name }))

    // Extract attachment metadata from bodyStructure
    const attachments = this.extractAttachmentMetadata(msg.bodyStructure)

    // Match contacts by email addresses
    const allAddresses = [
      from?.address,
      ...toAddresses.map((a: any) => a.address),
      ...ccAddresses.map((a: any) => a.address),
    ].filter(Boolean).map((a: string) => a.toLowerCase())

    const matchedContactIds = await this.matchContacts(agencyId, allAddresses)

    // Compute thread ID
    const threadId = await this.computeThreadId(accountId, envelope?.messageId, envelope?.inReplyTo)

    // Determine outbound direction
    const account = await this.emailAccountsService.getAccountById(accountId)
    const isOutbound = from?.address?.toLowerCase() === account.emailAddress.toLowerCase()

    // Dedup: Check if this outbound message was already saved by sendRaw (imapUid=null)
    if (envelope?.messageId) {
      const [existing] = await this.db.client
        .select({ id: this.db.schema.syncedEmails.id })
        .from(this.db.schema.syncedEmails)
        .where(
          and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            eq(this.db.schema.syncedEmails.messageId, envelope.messageId),
            isNull(this.db.schema.syncedEmails.imapUid),
          ),
        )
        .limit(1)

      if (existing) {
        // Update the provisional row with the real IMAP UID and flags
        await this.db.client
          .update(this.db.schema.syncedEmails)
          .set({
            imapUid: Number(msg.uid),
            folder,
            isSeen: flags.has('\\Seen'),
            isFlagged: flags.has('\\Flagged'),
            isAnswered: flags.has('\\Answered'),
            isDraft: flags.has('\\Draft'),
            hasAttachments: attachments.length > 0,
            sizeBytes: msg.size != null ? Number(msg.size) : null,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.syncedEmails.id, existing.id))

        // Still insert attachments if any
        if (attachments.length > 0) {
          await this.db.client
            .insert(this.db.schema.emailAttachments)
            .values(
              attachments.map((att: any) => ({
                emailId: existing.id,
                filename: att.filename,
                contentType: att.contentType,
                sizeBytes: att.size,
                contentId: att.contentId,
                isInline: att.isInline ?? false,
                imapPartId: att.partId,
              })),
            )
            .onConflictDoNothing()
        }

        return // Early exit — deduped with existing row
      }
    }

    // Upsert (idempotent — ON CONFLICT updates flags)
    const [upserted] = await this.db.client
      .insert(this.db.schema.syncedEmails)
      .values({
        emailAccountId: accountId,
        agencyId,
        messageId: envelope?.messageId,
        imapUid: Number(msg.uid),
        folder,
        inReplyTo: envelope?.inReplyTo,
        referencesHeader: Array.isArray(envelope?.references)
          ? envelope.references.join(' ')
          : envelope?.references,
        threadId,
        fromAddress: from?.address,
        fromName: from?.name,
        toAddresses,
        ccAddresses,
        subject: envelope?.subject,
        date: envelope?.date ? new Date(envelope.date) : null,
        isSeen: flags.has('\\Seen'),
        isFlagged: flags.has('\\Flagged'),
        isAnswered: flags.has('\\Answered'),
        isDraft: flags.has('\\Draft'),
        isOutbound,
        matchedContactIds,
        hasAttachments: attachments.length > 0,
        sizeBytes: msg.size != null ? Number(msg.size) : null,
      })
      .onConflictDoUpdate({
        target: [
          this.db.schema.syncedEmails.emailAccountId,
          this.db.schema.syncedEmails.folder,
          this.db.schema.syncedEmails.imapUid,
        ],
        set: {
          isSeen: sql`EXCLUDED.is_seen`,
          isFlagged: sql`EXCLUDED.is_flagged`,
          isAnswered: sql`EXCLUDED.is_answered`,
          isDraft: sql`EXCLUDED.is_draft`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: this.db.schema.syncedEmails.id })

    // Insert attachment metadata
    if (upserted && attachments.length > 0) {
      await this.db.client
        .insert(this.db.schema.emailAttachments)
        .values(
          attachments.map((att: any) => ({
            emailId: upserted.id,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.size,
            contentId: att.contentId,
            isInline: att.isInline ?? false,
            imapPartId: att.partId,
          })),
        )
        .onConflictDoNothing()
    }
  }

  private extractAttachmentMetadata(bodyStructure: any): any[] {
    if (!bodyStructure) return []

    const attachments: any[] = []

    const walk = (part: any, partId = '') => {
      if (part.childNodes) {
        part.childNodes.forEach((child: any, i: number) => {
          walk(child, partId ? `${partId}.${i + 1}` : `${i + 1}`)
        })
      } else if (part.disposition === 'attachment' || (part.disposition === 'inline' && part.id)) {
        attachments.push({
          filename: part.dispositionParameters?.filename || part.parameters?.name,
          contentType: part.type,
          size: part.size,
          contentId: part.id,
          isInline: part.disposition === 'inline',
          partId,
        })
      }
    }

    walk(bodyStructure)
    return attachments
  }

  private async matchContacts(agencyId: string, addresses: string[]): Promise<string[]> {
    if (addresses.length === 0) return []

    const results = await this.db.client
      .select({ id: this.db.schema.contacts.id })
      .from(this.db.schema.contacts)
      .where(
        and(
          eq(this.db.schema.contacts.agencyId, agencyId),
          sql`lower(${this.db.schema.contacts.email}) IN (${sql.join(
            addresses.map((a) => sql`${a}`),
            sql`, `,
          )})`,
        ),
      )

    return results.map((r) => r.id)
  }

  private async computeThreadId(
    accountId: string,
    _messageId?: string,
    inReplyTo?: string,
  ): Promise<string | null> {
    if (!inReplyTo) return null

    // Look for existing email with matching messageId
    const [existing] = await this.db.client
      .select({ threadId: this.db.schema.syncedEmails.threadId })
      .from(this.db.schema.syncedEmails)
      .where(
        and(
          eq(this.db.schema.syncedEmails.emailAccountId, accountId),
          eq(this.db.schema.syncedEmails.messageId, inReplyTo),
        ),
      )
      .limit(1)

    if (existing?.threadId) {
      return existing.threadId
    }

    // Generate a new thread ID (first email in the thread)
    return crypto.randomUUID()
  }
}
