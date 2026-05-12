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

/**
 * Recognises low-level socket / connection drops that are safe to retry on
 * idempotent reads. Covers both Supabase pooler hiccups and IMAP server
 * forced disconnects. Auth failures are deliberately NOT included — those
 * are permanent and handled separately.
 */
function isTransientNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return true
  }
  const msg = (err as { message?: string }).message || ''
  return /ECONNRESET|socket hang up|read ETIMEDOUT|Connection terminated/i.test(msg)
}

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

      // Background sync: INBOX only, incremental, bounded to 100 messages.
      // Sent and other folders sync on-demand when the user opens them.
      const freshAccount = await this.emailAccountsService.getAccountById(accountId)
      const currentSyncState = (freshAccount.syncState as any) ?? {}
      const result = await this.syncFolder(client, accountId, account.agencyId, currentSyncState, 'INBOX', {
        mode: 'incremental',
        batchSize: 25,
      })
      newMessages += result.newMessages
      newSenders.push(...result.newSenders)
      errors.push(...result.errors)

      await client.logout()

      // Backfill NULL dates from synced_at for any previously synced emails
      await this.db.client.execute(
        sql`UPDATE ${this.db.schema.syncedEmails} SET date = synced_at WHERE date IS NULL AND ${this.db.schema.syncedEmails.emailAccountId} = ${accountId}`,
      )
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`Sync failed for account ${accountId}: ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId, (account.syncState as Record<string, unknown>) ?? {})
      const errorDetail = error.responseText ? `${error.message}: ${error.responseText}` : error.message
      await this.emailAccountsService.updateSyncState(
        accountId,
        (account.syncState as Record<string, unknown>) ?? {},
        errorDetail,
      )
      errors.push(errorDetail)
    }

    // Notify account owner of new emails
    if (newMessages > 0) {
      this.logger.log(`Sending notification: ${newMessages} new email(s) for user ${account.userId}`)
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
          forceChannels: ['platform'], // Platform only — email channel would be circular
          data: {
            notificationType: 'email.received',
            emailAccountId: accountId,
            newMessageCount: newMessages,
          },
        })
        this.logger.log(`Notification sent successfully: "${title}"`)
      } catch (err: any) {
        this.logger.warn(`Failed to send new email notification: ${err.message}`, err.stack)
      }
    }

    return { newMessages, errors }
  }

  /**
   * Fetch full email body on demand (lazy load)
   * Retries download up to 2 times on transient IMAP failures.
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

    const MAX_RETRIES = 2
    let lastError: any = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          if (!downloadResult?.content || typeof downloadResult.content[Symbol.asyncIterator] !== 'function') {
            this.logger.warn(
              `No content returned for UID ${email.imapUid} in ${email.folder} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
            )
            // Retry on empty download — transient IMAP issue
            if (attempt < MAX_RETRIES) {
              continue
            }
            return { bodyHtml: null, bodyText: null, snippet: null }
          }
          const chunks: Buffer[] = []
          for await (const chunk of downloadResult.content) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const rawMessage = Buffer.concat(chunks)

          const { bodyHtml, bodyText, snippet } = await this.parseMessageSource(rawMessage)

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
        lastError = error
        // Auth failures should not be retried
        if (error.authenticationFailed || error.code === 'AUTHENTICATIONFAILED') {
          break
        }
        if (attempt < MAX_RETRIES) {
          this.logger.warn(
            `Body fetch attempt ${attempt + 1} failed for email ${emailId}, retrying...`,
          )
          continue
        }
      }
    }

    const detail = lastError?.responseText || lastError?.responseStatus || lastError?.message
    this.logger.error(`Body fetch failed for email ${emailId} after ${MAX_RETRIES + 1} attempts: ${detail}`, lastError?.stack)
    await this.handleImapAuthFailure(lastError, accountId)
    throw lastError
  }

  /**
   * List IMAP folders for an account
   */
  async listFolders(accountId: string): Promise<EmailFolderDto[]> {
    // One-shot retry on transient socket-level failures (ECONNRESET,
    // ETIMEDOUT, EPIPE) from either the Supabase pooler or the IMAP server.
    // The op is idempotent (pure reads) so retry is safe. Account/auth
    // failures are NOT retried — they're handled in the catch as before.
    const MAX_ATTEMPTS = 2
    let lastError: any
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.doListFolders(accountId)
      } catch (error: any) {
        lastError = error
        if (!isTransientNetworkError(error) || attempt === MAX_ATTEMPTS) {
          break
        }
        const backoffMs = 250 * attempt
        this.logger.warn(
          `List folders attempt ${attempt}/${MAX_ATTEMPTS} for account ${accountId} hit transient error ${error.code || error.message}; retrying in ${backoffMs}ms`,
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }
    }

    // Final failure — degrade gracefully (empty list) and log. The IMAP
    // auth handler still runs so credential-revocation flow is intact.
    const detail = lastError?.responseText || lastError?.responseStatus || lastError?.message
    this.logger.error(
      `List folders failed for account ${accountId} after ${MAX_ATTEMPTS} attempt(s): ${detail}`,
      lastError?.stack,
    )
    try {
      const account = await this.emailAccountsService.getAccountById(accountId)
      await this.handleImapAuthFailure(lastError, accountId, (account?.syncState as Record<string, unknown>) ?? {})
    } catch {
      // If even the account fetch fails (e.g. DB still down), don't compound
      // the error — the original cause is already logged above.
    }
    return []
  }

  /**
   * Inner helper for listFolders — performs one attempt without retry.
   */
  private async doListFolders(accountId: string): Promise<EmailFolderDto[]> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)

    const client = await this.createImapClient({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      user: credentials.username,
      pass: credentials.password,
    })

    try {
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
    } catch (err) {
      // Make sure the IMAP socket isn't left dangling on partial failures
      // before letting the outer retry/error path see the rejection.
      try { await client.logout() } catch { /* ignore secondary close errors */ }
      throw err
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
      // After successful IMAP rename, migrate sync state
      const updatedAccount = await this.emailAccountsService.getAccountById(accountId)
      const syncState = (updatedAccount.syncState as any) ?? {}
      if (syncState.folders?.[path]) {
        syncState.folders[newPath] = syncState.folders[path]
        delete syncState.folders[path]
        await this.emailAccountsService.updateSyncState(accountId, syncState)
      }
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
        if (!downloadResult?.content || typeof downloadResult.content[Symbol.asyncIterator] !== 'function') {
          throw new NotFoundException('Attachment content not available from IMAP server')
        }
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

  /**
   * Sync a single folder on demand (called from controller/frontend).
   * Handles connection lifecycle and sync state persistence.
   */
  async syncFolderOnDemand(
    accountId: string,
    folder: string,
    mode: 'incremental' | 'hydrate_recent' | 'hydrate_older',
    batchSize?: number,
  ): Promise<{ fetched: number; folder: string; historyExhausted?: boolean }> {
    const account = await this.emailAccountsService.getAccountById(accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)
    const syncState = (account.syncState as any) ?? {}

    try {
      const client = await this.createImapClient({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapTls,
        user: credentials.username,
        pass: credentials.password,
      })

      await client.connect()
      this.logger.debug(`On-demand sync: connected to ${account.imapHost} for ${folder} (mode=${mode})`)
      try {
        const result = await this.syncFolder(client, accountId, account.agencyId, syncState, folder, { mode, batchSize })
        // syncFolder already persists sync state — no need to call updateSyncState again
        return { fetched: result.newMessages, folder, historyExhausted: result.historyExhausted }
      } finally {
        await client.logout()
      }
    } catch (error: any) {
      const detail = error.responseText || error.responseStatus || error.message
      this.logger.error(`On-demand sync failed for ${folder} (account ${accountId}): ${detail}`, error.stack)
      await this.handleImapAuthFailure(error, accountId, syncState)
      // Enrich error message with IMAP server response for better Sentry visibility
      if (error.responseText && error.message === 'Command failed') {
        error.message = `IMAP command failed: ${error.responseText}`
      }
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
    // Connection-level failures (timeout, refused, DNS, reset) — mark so scheduler skips retries
    if (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'EAI_AGAIN' ||
      error.message?.includes('Connection timed out') ||
      error.message?.includes('getaddrinfo')
    ) {
      const msg = `IMAP_CONNECTION_FAILED: ${error.code || error.message}`
      await this.emailAccountsService.updateSyncState(accountId, syncState ?? {}, msg)
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
      connectionTimeout: 15_000,  // 15s to establish TCP connection
      greetTimeout: 15_000,       // 15s to receive server greeting
      socketTimeout: 30_000,      // 30s inactivity timeout on socket
    })
    // Prevent unhandled 'error' event from crashing the process
    client.on('error', (err: Error) => {
      this.logger.warn(`ImapFlow error (${config.host}): ${err.message}`)
    })
    return client
  }

  /**
   * Sync a single IMAP folder — fetches messages and upserts them.
   *
   * Supports three sync modes:
   * - `incremental` (default): fetch UIDs from lastUid+1 onwards (new mail)
   * - `hydrate_recent`: fetch the newest `batchSize` messages from the tail
   * - `hydrate_older`: fetch the next older batch before oldestSyncedUid
   */
  private async syncFolder(
    client: any,
    accountId: string,
    agencyId: string,
    syncState: any,
    folderPath: string,
    options?: {
      mode?: 'incremental' | 'hydrate_recent' | 'hydrate_older'
      batchSize?: number
    },
  ): Promise<{ newMessages: number; newSenders: string[]; errors: string[]; historyExhausted?: boolean }> {
    const mode = options?.mode ?? 'incremental'
    const batchSize = Math.min(options?.batchSize ?? 25, 50)

    let newMessages = 0
    const newSenders: string[] = []
    const errors: string[] = []
    let historyExhausted = false

    const lock = await client.getMailboxLock(folderPath)
    try {
      const folderState = syncState?.folders?.[folderPath] ?? {}
      const lastUid = folderState.lastUid ?? 0
      const oldestSyncedUid = folderState.oldestSyncedUid ?? 0
      historyExhausted = folderState.historyExhausted ?? false
      let highestPersistedUid = lastUid
      let lowestPersistedUid = oldestSyncedUid || Infinity

      // UIDVALIDITY check — if the server has reassigned UIDs, our cursors are
      // stale and we must wipe synced data for this folder and start over.
      // Note: ImapFlow may return BigInt — always convert to Number for JSONB compatibility
      const serverUidValidity = client.mailbox?.uidValidity != null ? Number(client.mailbox.uidValidity) : undefined
      if (folderState.uidValidity && serverUidValidity && serverUidValidity !== folderState.uidValidity) {
        this.logger.warn(`UIDVALIDITY changed for ${folderPath}. Resetting cursors.`)
        await this.db.client
          .delete(this.db.schema.syncedEmails)
          .where(and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            eq(this.db.schema.syncedEmails.folder, folderPath),
          ))
        // Reset folder state so subsequent logic uses fresh cursors
        Object.assign(folderState, { lastUid: 0, oldestSyncedUid: 0, historyExhausted: false })
      }

      // Check if there are potentially new messages before fetching
      const mailboxStatus = client.mailbox
      const uidNext = mailboxStatus && typeof mailboxStatus === 'object'
        ? Number((mailboxStatus as any).uidNext)
        : undefined

      // --- Compute fetchRange based on mode ---
      let fetchRange: string | null = null
      let skipLowUid = 0 // UIDs <= this value are skipped (already persisted)

      if (mode === 'incremental') {
        const effectiveLastUid = folderState.lastUid ?? 0
        if (effectiveLastUid > 0) {
          // Skip if server says there's nothing new
          if (uidNext && uidNext <= effectiveLastUid + 1) {
            this.logger.debug(`No new messages in ${folderPath} (uidNext=${uidNext}, lastUid=${effectiveLastUid})`)
          } else {
            // Cap incremental fetch to avoid pulling entire backlog
            const end = uidNext ? Math.min(uidNext - 1, effectiveLastUid + batchSize) : effectiveLastUid + batchSize
            fetchRange = `${effectiveLastUid + 1}:${end}`
            skipLowUid = effectiveLastUid
          }
        } else {
          // First sync — grab the most recent batchSize messages
          const start = uidNext ? Math.max(1, uidNext - batchSize) : 1
          fetchRange = `${start}:*`
          skipLowUid = 0
        }
      } else if (mode === 'hydrate_recent') {
        const start = uidNext ? Math.max(1, uidNext - batchSize) : 1
        fetchRange = `${start}:*`
        skipLowUid = 0
      } else if (mode === 'hydrate_older') {
        const effectiveOldest = folderState.oldestSyncedUid ?? 0
        if (historyExhausted || effectiveOldest <= 1) {
          // Nothing older to fetch
          return { newMessages: 0, newSenders: [], errors: [], historyExhausted: true }
        }
        const end = effectiveOldest - 1
        const start = Math.max(1, effectiveOldest - batchSize)
        fetchRange = `${start}:${end}`
        skipLowUid = 0
      }

      if (fetchRange) {
        this.logger.debug(`[${mode}] Fetching UIDs ${fetchRange} from ${folderPath} (lastUid=${folderState.lastUid ?? 0}, oldestSyncedUid=${folderState.oldestSyncedUid ?? 0}, uidNext=${uidNext})`)
        for await (const msg of client.fetch(fetchRange, {
          envelope: true,
          bodyStructure: true,
          flags: true,
          uid: true,
          internalDate: true,
          source: true,
          size: true,
        }, { uid: true })) {
          if (skipLowUid > 0 && Number(msg.uid) <= skipLowUid) continue

          try {
            await this.upsertEmailFromImap(accountId, agencyId, folderPath, msg)
            highestPersistedUid = Math.max(highestPersistedUid, Number(msg.uid))
            lowestPersistedUid = Math.min(lowestPersistedUid, Number(msg.uid))
            newMessages++
            const from = msg.envelope?.from?.[0]
            if (from) {
              newSenders.push(from.name || from.address || 'Unknown')
            }
          } catch (err: any) {
            this.logger.error(`Failed to upsert UID ${msg.uid} in ${folderPath}: ${err.message}`, err.stack)
            errors.push(`${folderPath} UID ${msg.uid}: ${err.message}`)
          }
        }
      }

      // --- Update sync state ---
      const updatedFolderState: any = {
        ...folderState,
        lastUid: Math.max(folderState.lastUid ?? 0, highestPersistedUid),
        lastSyncAt: new Date().toISOString(),
        uidValidity: client.mailbox?.uidValidity != null ? Number(client.mailbox.uidValidity) : folderState.uidValidity,
      }

      if (mode === 'hydrate_recent' || mode === 'hydrate_older') {
        if (lowestPersistedUid < Infinity) {
          updatedFolderState.oldestSyncedUid = Math.min(
            oldestSyncedUid || Infinity,
            lowestPersistedUid,
          )
          if (updatedFolderState.oldestSyncedUid === Infinity) {
            updatedFolderState.oldestSyncedUid = lowestPersistedUid
          }
        }
        // Mark exhausted based on cursor position, not row count.
        // UID gaps from deletions/expunges can yield fewer messages than batchSize
        // even when older mail still exists.
        const effectiveOldest = updatedFolderState.oldestSyncedUid ?? lowestPersistedUid
        if (effectiveOldest <= 1 || (mode === 'hydrate_older' && fetchRange && fetchRange.startsWith('1:'))) {
          updatedFolderState.historyExhausted = true
          historyExhausted = true
        }
      }

      syncState.folders = syncState.folders ?? {}
      syncState.folders[folderPath] = updatedFolderState

      await this.emailAccountsService.updateSyncState(accountId, {
        ...syncState,
        folders: {
          ...syncState.folders,
          [folderPath]: updatedFolderState,
        },
      })
    } finally {
      lock.release()
    }

    return { newMessages, newSenders, errors, historyExhausted }
  }

  /**
   * Safely parse an IMAP date value (envelope.date or internalDate).
   * Returns null if the value is missing, empty, or produces an Invalid Date.
   */
  private normalizeImapDate(value: unknown): Date | null {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(d.getTime()) ? null : d
  }


  /**
   * Parse a raw RFC822 message source into HTML, text, and snippet.
   * Resolves CID inline images to data URIs so they display in the browser.
   * Shared by both sync (eager) and fetchEmailBody (lazy fallback).
   */
  private async parseMessageSource(source: Buffer | Uint8Array): Promise<{
    bodyHtml: string | null
    bodyText: string | null
    snippet: string | null
  }> {
    try {
      const { default: PostalMime } = await import('postal-mime')
      const parser = new PostalMime()
      const parsed = await parser.parse(source)
      let bodyHtml = parsed.html || null
      const bodyText = parsed.text || null
      const snippet = bodyText
        ? bodyText.substring(0, 200).replace(/\s+/g, ' ').trim()
        : null

      // Resolve CID inline images to data URIs
      if (bodyHtml && parsed.attachments?.length) {
        const cidMap = new Map<string, string>()
        for (const att of parsed.attachments) {
          if (att.contentId && att.content) {
            const cid = att.contentId.replace(/^<|>$/g, '')
            const mimeType = att.mimeType || 'application/octet-stream'
            const b64 = Buffer.from(att.content).toString('base64')
            cidMap.set(cid, `data:${mimeType};base64,${b64}`)
          }
        }
        if (cidMap.size > 0) {
          bodyHtml = bodyHtml.replace(
            /cid:([^"'\s)]+)/g,
            (match, cid) => cidMap.get(cid) ?? match,
          )
        }
      }

      return { bodyHtml, bodyText, snippet }
    } catch (err: any) {
      this.logger.warn(`Failed to parse message source: ${err.message}`)
      return { bodyHtml: null, bodyText: null, snippet: null }
    }
  }

  private async upsertEmailFromImap(
    accountId: string,
    agencyId: string,
    folder: string,
    msg: any,
  ): Promise<void> {
    const envelope = msg.envelope
    const flags = msg.flags ?? new Set()

    // Safely parse date — envelope.date can be an unparseable string
    const headerDate = this.normalizeImapDate(envelope?.date)
    const receivedDate = this.normalizeImapDate(msg.internalDate)
    const emailDate = headerDate ?? receivedDate

    // Extract addresses
    const from = envelope?.from?.[0]
    const toAddresses = (envelope?.to ?? []).map((a: any) => ({ address: a.address, name: a.name }))
    const ccAddresses = (envelope?.cc ?? []).map((a: any) => ({ address: a.address, name: a.name }))

    // Extract attachment metadata from bodyStructure
    const attachments = this.extractAttachmentMetadata(msg.bodyStructure)

    // Parse body from source (if available and under size threshold)
    let bodyHtml: string | null = null
    let bodyText: string | null = null
    let snippet: string | null = null
    const MAX_SOURCE_SIZE = 5 * 1024 * 1024 // 5MB — covers 99%+ of emails; outliers lazy-load
    if (msg.source && (!msg.size || Number(msg.size) < MAX_SOURCE_SIZE)) {
      const parsed = await this.parseMessageSource(msg.source)
      bodyHtml = parsed.bodyHtml
      bodyText = parsed.bodyText
      snippet = parsed.snippet
    }

    // Match contacts by email addresses
    const allAddresses = [
      from?.address,
      ...toAddresses.map((a: any) => a.address),
      ...ccAddresses.map((a: any) => a.address),
    ].filter(Boolean).map((a: string) => a.toLowerCase())

    const matchedContactIds = await this.matchContacts(agencyId, allAddresses)

    // Compute thread ID — considers inReplyTo and References header
    const referencesRaw = Array.isArray(envelope?.references)
      ? envelope.references.join(' ')
      : envelope?.references
    const threadId = await this.computeThreadId(accountId, envelope?.messageId, envelope?.inReplyTo, referencesRaw)

    // Determine outbound direction
    const account = await this.emailAccountsService.getAccountById(accountId)
    const isOutbound = from?.address?.toLowerCase() === account.emailAddress.toLowerCase()

    // Dedup: Check if this outbound message was already saved by sendRaw (imapUid=null)
    if (envelope?.messageId) {
      const [existing] = await this.db.client
        .select({
          id: this.db.schema.syncedEmails.id,
          threadId: this.db.schema.syncedEmails.threadId,
        })
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
        // Preserve the existing threadId if it is already set; otherwise use
        // the threadId we just computed (which may have backfilled a parent).
        const resolvedThreadId = existing.threadId ?? threadId

        // Update the provisional row with the real IMAP UID and flags
        await this.db.client
          .update(this.db.schema.syncedEmails)
          .set({
            imapUid: Number(msg.uid),
            folder,
            date: emailDate,
            bodyHtml: bodyHtml ?? undefined,
            bodyText: bodyText ?? undefined,
            snippet: snippet ?? undefined,
            isSeen: flags.has('\\Seen'),
            isFlagged: flags.has('\\Flagged'),
            isAnswered: flags.has('\\Answered'),
            isDraft: flags.has('\\Draft'),
            hasAttachments: attachments.length > 0,
            sizeBytes: msg.size != null ? Number(msg.size) : null,
            threadId: resolvedThreadId,
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
        bodyHtml,
        bodyText,
        snippet,
        date: emailDate,
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
          // Backfill body if currently null (don't overwrite existing body)
          bodyHtml: sql`COALESCE(synced_emails.body_html, EXCLUDED.body_html)`,
          bodyText: sql`COALESCE(synced_emails.body_text, EXCLUDED.body_text)`,
          snippet: sql`COALESCE(synced_emails.snippet, EXCLUDED.snippet)`,
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
    messageId?: string,
    inReplyTo?: string,
    referencesHeader?: string,
  ): Promise<string> {
    // Build a list of candidate parent message-IDs to search for
    const candidateIds: string[] = []
    if (inReplyTo) candidateIds.push(inReplyTo)
    if (referencesHeader) {
      // References is a space-separated list of message-IDs
      const refs = referencesHeader.split(/\s+/).filter(Boolean)
      for (const ref of refs) {
        if (!candidateIds.includes(ref)) candidateIds.push(ref)
      }
    }

    if (candidateIds.length > 0) {
      // Look for any existing email whose messageId matches one of the candidates
      const [existing] = await this.db.client
        .select({
          id: this.db.schema.syncedEmails.id,
          threadId: this.db.schema.syncedEmails.threadId,
        })
        .from(this.db.schema.syncedEmails)
        .where(
          and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            sql`${this.db.schema.syncedEmails.messageId} IN (${sql.join(
              candidateIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .limit(1)

      if (existing) {
        if (existing.threadId) {
          // Matched email already belongs to a thread — join it
          return existing.threadId
        }

        // Matched email exists but has no threadId yet — create a thread and
        // backfill the matched email so the whole conversation is linked
        const newThreadId = crypto.randomUUID()
        await this.db.client
          .update(this.db.schema.syncedEmails)
          .set({ threadId: newThreadId, updatedAt: new Date() })
          .where(eq(this.db.schema.syncedEmails.id, existing.id))
        return newThreadId
      }
    }

    // No parent found — this message starts a new thread
    return crypto.randomUUID()
  }
}
