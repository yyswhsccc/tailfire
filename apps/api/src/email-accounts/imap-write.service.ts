import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { EncryptionService } from '../common/encryption/encryption.service'
import { assertPublicHost } from '../common/guards/assert-public-host'

/**
 * ImapWriteService — standalone IMAP write operations.
 *
 * Intentionally does NOT depend on EmailAccountsService to avoid circular DI.
 * Only depends on DatabaseService (for account lookup) and EncryptionService
 * (for credential decryption).
 */
@Injectable()
export class ImapWriteService {
  private readonly logger = new Logger(ImapWriteService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Add or remove IMAP flags on a message.
   *
   * @param accountId  Email account UUID
   * @param uid        IMAP UID of the message
   * @param folder     Mailbox folder (e.g. 'INBOX')
   * @param flags      Flags to set — `true` adds, `false` removes, `undefined` leaves unchanged
   */
  async writeFlags(
    accountId: string,
    uid: number,
    folder: string,
    flags: { isSeen?: boolean; isFlagged?: boolean },
  ): Promise<void> {
    const client = await this.connectToAccount(accountId)
    try {
      const lock = await client.getMailboxLock(folder)
      try {
        if (flags.isSeen === true) {
          await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
        } else if (flags.isSeen === false) {
          await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true })
        }

        if (flags.isFlagged === true) {
          await client.messageFlagsAdd({ uid }, ['\\Flagged'], { uid: true })
        } else if (flags.isFlagged === false) {
          await client.messageFlagsRemove({ uid }, ['\\Flagged'], { uid: true })
        }

        this.logger.debug(`Wrote flags for UID ${uid} in ${folder} (account ${accountId})`)
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }
  }

  /**
   * Move a message between IMAP folders.
   *
   * @returns The new UID in the destination folder (null if server didn't report it)
   */
  async moveMessage(
    accountId: string,
    uid: number,
    fromFolder: string,
    toFolder: string,
  ): Promise<{ newUid: number | null }> {
    const client = await this.connectToAccount(accountId)
    try {
      const lock = await client.getMailboxLock(fromFolder)
      try {
        // imapflow types messageMove as `false | CopyResponseObject` — narrow before access.
        // CopyResponseObject.destination is typed `string` in older d.ts but at
        // runtime it returns the rich object form when called with `uid: true`.
        // Cast to access `uidMap` from the real response shape.
        const result = await client.messageMove({ uid }, toFolder, { uid: true })
        const uidMap =
          result === false
            ? undefined
            : (result?.destination as unknown as { uidMap?: Record<string, number> })?.uidMap
        const newUid = uidMap ? Number(Object.values(uidMap)[0]) || null : null
        this.logger.debug(
          `Moved UID ${uid} from ${fromFolder} to ${toFolder} → newUid=${newUid} (account ${accountId})`,
        )
        return { newUid }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }
  }

  /**
   * Delete a message by moving it to Trash.
   */
  async deleteMessage(
    accountId: string,
    uid: number,
    folder: string,
  ): Promise<void> {
    await this.moveMessage(accountId, uid, folder, 'Trash')
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Look up account IMAP config + credentials, decrypt, and return a connected
   * ImapFlow client. Caller is responsible for logout.
   */
  private async connectToAccount(accountId: string) {
    const [account] = await this.db.client
      .select({
        imapHost: this.db.schema.emailAccounts.imapHost,
        imapPort: this.db.schema.emailAccounts.imapPort,
        imapTls: this.db.schema.emailAccounts.imapTls,
        credentials: this.db.schema.emailAccounts.credentials,
      })
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.id, accountId))
      .limit(1)

    if (!account) {
      throw new NotFoundException(`Email account ${accountId} not found`)
    }

    // decryptObject returns unknown; we know the shape from how
    // credentials are encrypted by the IMAP onboarding flow.
    const { username, password } = this.encryptionService.decryptObject(
      account.credentials as any,
    ) as { username: string; password: string }

    await assertPublicHost(account.imapHost)

    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      auth: { user: username, pass: password },
      logger: false,
    })

    // Prevent unhandled 'error' event from crashing the process
    client.on('error', (err: Error) => {
      this.logger.warn(`ImapFlow error (${account.imapHost}): ${err.message}`)
    })

    await client.connect()
    return client
  }
}
