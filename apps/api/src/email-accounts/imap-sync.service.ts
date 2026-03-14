import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { EmailAccountsService } from './email-accounts.service'
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
      this.logger.warn(`IMAP connection test failed: ${error.message}`)
      return { success: false, error: error.message }
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

        // Fetch new messages (metadata only — no body)
        const fetchRange = lastUid > 0 ? `${lastUid + 1}:*` : '1:*'
        this.logger.debug(`Fetching UIDs ${fetchRange} from INBOX (lastUid=${lastUid}, mailbox.exists=${(client.mailbox as any)?.exists})`)
        for await (const msg of client.fetch(fetchRange, {
          envelope: true,
          bodyStructure: true,
          flags: true,
          uid: true,
        })) {
          this.logger.debug(`Processing UID ${msg.uid} (subject: ${msg.envelope?.subject})`)
          if (Number(msg.uid) <= lastUid) continue

          try {
            await this.upsertEmailFromImap(accountId, account.agencyId, 'INBOX', msg)
            newMessages++
          } catch (err: any) {
            this.logger.error(`Failed to upsert UID ${msg.uid}: ${err.message}`, err.stack)
            errors.push(`UID ${msg.uid}: ${err.message}`)
          }
        }

        // Update sync state
        const mailbox = client.mailbox
        // ImapFlow returns BigInt for uidValidity/uidNext — convert to Number for JSON serialization
        const uidValidity = mailbox && typeof mailbox === 'object' ? Number((mailbox as any).uidValidity) : undefined
        const uidNext = mailbox && typeof mailbox === 'object' ? Number((mailbox as any).uidNext) : undefined
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
      this.logger.error(`Sync failed for account ${accountId}: ${error.message}`)
      await this.emailAccountsService.updateSyncState(
        accountId,
        (account.syncState as Record<string, unknown>) ?? {},
        error.message,
      )
      errors.push(error.message)
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
      this.logger.error(`Body fetch failed for email ${emailId}: ${error.message}`)
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

      return mailboxes.map((mb) => ({
        name: mb.name,
        path: mb.path,
        specialUse: mb.specialUse || undefined,
        totalMessages: mb.status?.messages ?? 0,
        unseenMessages: mb.status?.unseen ?? 0,
      }))
    } catch (error: any) {
      this.logger.error(`List folders failed for account ${accountId}: ${error.message}`)
      return []
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

    // TODO: In Phase 2, cache in storage and return from cache if available
    // For now, always fetch from IMAP
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
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

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
