import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

/**
 * Structure of encrypted data returned by encrypt()
 * All values are base64-encoded strings
 */
export interface EncryptedData {
  iv: string        // Initialization vector (base64)
  ciphertext: string // Encrypted data (base64)
  authTag: string   // Authentication tag for GCM (base64)
}

/**
 * EncryptionService
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data.
 * The encryption key must be provided via ENCRYPTION_KEY environment variable
 * as a base64-encoded 32-byte key.
 *
 * Key versioning is supported via ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, ...
 * environment variables (hex-encoded 32-byte keys). This allows key rotation
 * without re-encrypting all rows at once — new data is encrypted with the
 * current version while older data can still be decrypted with its stored version.
 *
 * @example
 * ```typescript
 * const encrypted = await encryptionService.encrypt(JSON.stringify(credentials))
 * const decrypted = await encryptionService.decrypt(encrypted)
 *
 * // Versioned API (for SIN/BN and other sensitive fields)
 * const { ciphertext, keyVersion } = encryptionService.encryptWithVersion(sin)
 * const plain = encryptionService.decryptWithVersion(ciphertext, keyVersion)
 * ```
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name)
  private readonly encryptionKey: Buffer

  private readonly ALGORITHM = 'aes-256-gcm'
  private readonly IV_LENGTH = 16 // 128 bits

  // Versioned key registry — populated from ENCRYPTION_KEY_V1, V2, ... (hex)
  private readonly keyByVersion: Map<number, Buffer> = new Map()
  public readonly currentKeyVersion: number

  /**
   * Constructor initializes the encryption key immediately to ensure it's available
   * before any other services attempt to use encryption during their onModuleInit.
   *
   * In test mode (NODE_ENV=test), generates a random key if none is provided.
   *
   * @throws Error if ENCRYPTION_KEY is missing or invalid (production only)
   */
  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV')
    const isTestEnv = nodeEnv === 'test'

    // ── Versioned keys: ENCRYPTION_KEY_V1, V2, ... (hex-encoded 32-byte keys) ──
    let v = 1
    while (true) {
      const hexKey = this.configService.get<string>(`ENCRYPTION_KEY_V${v}`)
      if (!hexKey) break
      this.keyByVersion.set(v, Buffer.from(hexKey, 'hex'))
      v++
    }

    // currentKeyVersion = highest configured version, or 1 if none found
    this.currentKeyVersion = this.keyByVersion.size > 0 ? this.keyByVersion.size : 1

    // ── Legacy key: ENCRYPTION_KEY (base64-encoded 32-byte key) ──
    // Falls back to version 1 when no ENCRYPTION_KEY_V* vars are configured.
    let encryptionKeyBase64 = this.configService.get<string>('ENCRYPTION_KEY')

    if (!encryptionKeyBase64) {
      if (isTestEnv) {
        // Generate ephemeral key for test environment
        encryptionKeyBase64 = crypto.randomBytes(32).toString('base64')
        this.logger.debug('Generated ephemeral encryption key for test environment')
      } else {
        const errorMsg = 'ENCRYPTION_KEY environment variable is required but not set. Generate with: openssl rand -base64 32'
        this.logger.error(errorMsg)
        throw new Error(errorMsg)
      }
    }

    try {
      // Decode base64 string to Buffer
      const legacyKey = Buffer.from(encryptionKeyBase64, 'base64')

      // Validate key size (must be exactly 32 bytes for AES-256)
      if (legacyKey.length !== 32) {
        // If versioned keys are configured, the legacy key is not required to be
        // valid — it may be a hex-format placeholder set for test/versioned setups.
        if (this.keyByVersion.size > 0) {
          // Use an ephemeral key for the legacy encrypt()/decrypt() path so those
          // methods remain callable (existing callers won't use versioned data).
          this.encryptionKey = crypto.randomBytes(32)
          this.logger.debug('Legacy ENCRYPTION_KEY is not 32 bytes but versioned keys are present; using ephemeral key for legacy path')
        } else {
          throw new Error(
            `ENCRYPTION_KEY must be exactly 32 bytes (256 bits) when decoded. ` +
            `Got ${legacyKey.length} bytes. Generate a new key with: openssl rand -base64 32`
          )
        }
      } else {
        this.encryptionKey = legacyKey
      }

      // Register legacy key as version 1 fallback if no V1 was configured
      if (!this.keyByVersion.has(1)) {
        this.keyByVersion.set(1, this.encryptionKey)
      }

      this.logger.debug('EncryptionService initialized with AES-256-GCM')
    } catch (error: unknown) {
      const errorMsg = `Failed to initialize EncryptionService: ${error instanceof Error ? error.message : String(error)}`
      this.logger.error(errorMsg)
      throw new Error(errorMsg)
    }
  }

  /**
   * Encrypts plaintext data using AES-256-GCM
   *
   * @param plaintext - The data to encrypt (string)
   * @returns EncryptedData object containing iv, ciphertext, and authTag (all base64-encoded)
   * @throws Error if encryption fails
   */
  encrypt(plaintext: string): EncryptedData {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(this.IV_LENGTH)

      // Create cipher
      const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv)

      // Encrypt the data
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
      ciphertext += cipher.final('base64')

      // Get authentication tag
      const authTag = cipher.getAuthTag()

      return {
        iv: iv.toString('base64'),
        ciphertext,
        authTag: authTag.toString('base64')
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Encryption failed: ${errorMsg}`)
      throw new Error(`Encryption failed: ${errorMsg}`)
    }
  }

  /**
   * Decrypts data that was encrypted with encrypt()
   *
   * @param encrypted - EncryptedData object containing iv, ciphertext, and authTag
   * @returns Decrypted plaintext string
   * @throws Error if decryption fails or authentication tag verification fails
   */
  decrypt(encrypted: EncryptedData): string {
    try {
      // Convert base64 strings back to Buffers
      const iv = Buffer.from(encrypted.iv, 'base64')
      const authTag = Buffer.from(encrypted.authTag, 'base64')

      // Create decipher
      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.encryptionKey, iv)

      // Set authentication tag
      decipher.setAuthTag(authTag)

      // Decrypt the data
      let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8')
      plaintext += decipher.final('utf8')

      return plaintext
    } catch (error: unknown) {
      // GCM authentication failures will throw here
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Decryption failed: ${errorMsg}`)
      throw new Error(`Decryption failed - data may be corrupted or tampered: ${errorMsg}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Versioned API — for SIN/BN and other CRA-sensitive fields
  // Ciphertext layout: [iv: 12 bytes][authTag: 16 bytes][encrypted payload]
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Encrypts plaintext using a specific key version (AES-256-GCM, 12-byte IV).
   *
   * The returned `ciphertext` Buffer is self-contained:
   *   bytes 0–11  → IV (12 bytes)
   *   bytes 12–27 → GCM auth tag (16 bytes)
   *   bytes 28+   → encrypted payload
   *
   * Store `keyVersion` alongside the ciphertext so the correct key can be
   * looked up on decryption. This enables key rotation without a bulk
   * re-encryption pass.
   *
   * @param plain   - Plaintext string to encrypt (e.g. SIN, BN)
   * @param version - Key version to use; defaults to `currentKeyVersion`
   * @returns `{ ciphertext: Buffer, keyVersion: number }`
   * @throws Error if the requested version has no configured key
   */
  encryptWithVersion(
    plain: string,
    version?: number,
  ): { ciphertext: Buffer; keyVersion: number } {
    const v = version ?? this.currentKeyVersion
    const key = this.keyByVersion.get(v)
    if (!key) {
      throw new Error(`Encryption: no key configured for version ${v}`)
    }
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return { ciphertext: Buffer.concat([iv, tag, enc]), keyVersion: v }
  }

  /**
   * Decrypts a Buffer produced by `encryptWithVersion`.
   *
   * @param ciphertext - The combined IV+authTag+payload Buffer
   * @param version    - The key version stored alongside the ciphertext
   * @returns Decrypted plaintext string
   * @throws Error if the version has no configured key or GCM auth fails
   */
  decryptWithVersion(ciphertext: Buffer, version: number): string {
    const key = this.keyByVersion.get(version)
    if (!key) {
      throw new Error(`Encryption: no key configured for version ${version}`)
    }
    const iv = ciphertext.subarray(0, 12)
    const tag = ciphertext.subarray(12, 28)
    const enc = ciphertext.subarray(28)
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  }

  /**
   * Encrypts a JSON-serializable object
   *
   * @param data - Object to encrypt
   * @returns EncryptedData
   */
  encryptObject<T>(data: T): EncryptedData {
    const plaintext = JSON.stringify(data)
    return this.encrypt(plaintext)
  }

  /**
   * Decrypts data and parses it as JSON
   *
   * @param encrypted - EncryptedData to decrypt
   * @returns Parsed object
   */
  decryptObject<T>(encrypted: EncryptedData): T {
    const plaintext = this.decrypt(encrypted)
    return JSON.parse(plaintext)
  }
}
