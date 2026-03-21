/**
 * API Health Service
 *
 * Orchestrates health checks for all external API providers.
 * Stores results in api_health_checks table and notifies admins
 * on consecutive failures.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { eq, desc, lt, gt, and } from 'drizzle-orm'
import Redis from 'ioredis'
import { DatabaseService } from '../db/database.service'
import { NotificationService } from '../notifications/notification.service'
import { TraveltekAuthService } from '../cruise-booking/services/traveltek-auth.service'
import {
  HEALTH_PROVIDERS,
  type HealthProviderKey,
  type HealthCheckResult,
  type ProviderStatus,
} from './api-health.types'

// ============================================================================
// Environment variable mappings per provider
// ============================================================================

const PROVIDER_ENV_VARS: Record<HealthProviderKey, string[]> = {
  amadeus: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'],
  aerodatabox: ['AERODATABOX_RAPIDAPI_KEY'],
  traveltek: ['TRAVELTEK_API_URL', 'TRAVELTEK_USERNAME', 'TRAVELTEK_PASSWORD', 'TRAVELTEK_SID'],
  globus: [], // Globus has a default URL, no key required
  google_places: ['GOOGLE_PLACES_API_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  resend: ['RESEND_API_KEY'],
  unsplash: ['UNSPLASH_ACCESS_KEY'],
  openai: ['OPENAI_API_KEY'],
  exchange_rates: ['EXCHANGE_RATE_API_KEY'],
  cloudflare_r2: ['CLOUDFLARE_R2_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_BUCKET_NAME'],
  supabase_storage: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  backblaze_b2: ['BACKBLAZE_B2_KEY_ID', 'BACKBLAZE_B2_APPLICATION_KEY', 'BACKBLAZE_B2_BUCKET_NAME', 'BACKBLAZE_B2_ENDPOINT'],
  redis: ['REDIS_URL'],
  traveltek_ftp: ['TRAVELTEK_FTP_HOST', 'TRAVELTEK_FTP_USER', 'TRAVELTEK_FTP_PASSWORD'],
}

@Injectable()
export class ApiHealthService {
  private readonly logger = new Logger(ApiHealthService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly traveltekAuthService: TraveltekAuthService,
  ) {}

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if a provider's env vars are configured
   */
  isConfigured(providerKey: HealthProviderKey): boolean {
    const envVars = PROVIDER_ENV_VARS[providerKey]
    // Globus has no required env vars (default URL)
    if (envVars.length === 0) return true
    return envVars.every((v) => !!this.configService.get<string>(v))
  }

  /**
   * Run a health check for a single provider
   */
  async checkProvider(providerKey: HealthProviderKey): Promise<HealthCheckResult> {
    if (!this.isConfigured(providerKey)) {
      return {
        provider: providerKey,
        success: false,
        responseMs: 0,
        error: 'Provider not configured',
      }
    }

    const start = Date.now()
    try {
      await this.executeCheck(providerKey)
      const responseMs = Date.now() - start
      return { provider: providerKey, success: true, responseMs }
    } catch (error) {
      const responseMs = Date.now() - start
      const message = error instanceof Error ? error.message : String(error)
      return { provider: providerKey, success: false, responseMs, error: message }
    }
  }

  /**
   * Check all configured providers
   */
  async checkAllProviders(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = []
    for (const provider of HEALTH_PROVIDERS) {
      if (!this.isConfigured(provider.key)) continue
      const result = await this.checkProvider(provider.key)
      await this.checkAndNotify(provider.key, result)
      results.push(result)
    }
    return results
  }

  /**
   * Get latest status for all providers
   */
  async getLatestStatus(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = []

    for (const provider of HEALTH_PROVIDERS) {
      const configured = this.isConfigured(provider.key)

      // Get latest check
      const [latestCheck] = await this.db.client
        .select()
        .from(this.db.schema.apiHealthChecks)
        .where(eq(this.db.schema.apiHealthChecks.provider, provider.key))
        .orderBy(desc(this.db.schema.apiHealthChecks.checkedAt))
        .limit(1)

      // Count consecutive failures
      let consecutiveFailures = 0
      if (latestCheck && !latestCheck.success) {
        const recentChecks = await this.db.client
          .select()
          .from(this.db.schema.apiHealthChecks)
          .where(eq(this.db.schema.apiHealthChecks.provider, provider.key))
          .orderBy(desc(this.db.schema.apiHealthChecks.checkedAt))
          .limit(10)

        for (const check of recentChecks) {
          if (!check.success) {
            consecutiveFailures++
          } else {
            break
          }
        }
      }

      statuses.push({
        provider: provider.key,
        name: provider.name,
        category: provider.category,
        configured,
        lastCheck: latestCheck
          ? {
              success: latestCheck.success,
              responseMs: latestCheck.responseMs ?? 0,
              error: latestCheck.error ?? undefined,
              checkedAt: latestCheck.checkedAt.toISOString(),
            }
          : undefined,
        consecutiveFailures,
      })
    }

    return statuses
  }

  /**
   * Get check history for a provider
   */
  async getProviderHistory(providerKey: HealthProviderKey, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    return this.db.client
      .select()
      .from(this.db.schema.apiHealthChecks)
      .where(
        and(
          eq(this.db.schema.apiHealthChecks.provider, providerKey),
          gt(this.db.schema.apiHealthChecks.checkedAt, since),
        ),
      )
      .orderBy(desc(this.db.schema.apiHealthChecks.checkedAt))
  }

  /**
   * Write result to DB and notify admins on consecutive failures
   */
  async checkAndNotify(providerKey: string, result: HealthCheckResult): Promise<void> {
    // Write result to DB
    await this.db.client.insert(this.db.schema.apiHealthChecks).values({
      provider: result.provider,
      success: result.success,
      responseMs: result.responseMs,
      error: result.error ?? null,
    })

    if (!result.success) {
      // Check if previous check also failed (2 consecutive failures = alert)
      const recentChecks = await this.db.client
        .select()
        .from(this.db.schema.apiHealthChecks)
        .where(eq(this.db.schema.apiHealthChecks.provider, providerKey))
        .orderBy(desc(this.db.schema.apiHealthChecks.checkedAt))
        .limit(2)

      if (recentChecks.length >= 2 && !recentChecks[0]!.success && !recentChecks[1]!.success) {
        await this.notifyAdmins(providerKey, result.error)
      }
    }
  }

  /**
   * Delete checks older than the given number of days
   */
  async cleanupOldChecks(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const deleted = await this.db.client
      .delete(this.db.schema.apiHealthChecks)
      .where(lt(this.db.schema.apiHealthChecks.checkedAt, cutoff))
      .returning({ id: this.db.schema.apiHealthChecks.id })

    this.logger.log(`Cleaned up ${deleted.length} health checks older than ${days} days`)
    return deleted.length
  }

  // ============================================================================
  // PRIVATE: Per-provider check implementations
  // ============================================================================

  private async executeCheck(providerKey: HealthProviderKey): Promise<void> {
    switch (providerKey) {
      case 'amadeus':
        return this.checkAmadeus()
      case 'aerodatabox':
        return this.checkAerodatabox()
      case 'traveltek':
        return this.checkTraveltek()
      case 'globus':
        return this.checkGlobus()
      case 'google_places':
        return this.checkGooglePlaces()
      case 'stripe':
        return this.checkStripe()
      case 'resend':
        return this.checkResend()
      case 'unsplash':
        return this.checkUnsplash()
      case 'openai':
        return this.checkOpenAI()
      case 'exchange_rates':
        return this.checkExchangeRates()
      case 'cloudflare_r2':
        return this.checkCloudflareR2()
      case 'supabase_storage':
        return this.checkSupabaseStorage()
      case 'backblaze_b2':
        return this.checkBackblazeB2()
      case 'redis':
        return this.checkRedis()
      case 'traveltek_ftp':
        return this.checkTraveltekFtp()
      default:
        throw new Error(`Unknown provider: ${providerKey}`)
    }
  }

  /**
   * Amadeus: OAuth2 client credentials token acquisition
   */
  private async checkAmadeus(): Promise<void> {
    const clientId = this.configService.get<string>('AMADEUS_CLIENT_ID')!
    const clientSecret = this.configService.get<string>('AMADEUS_CLIENT_SECRET')!
    const baseUrl = this.configService.get<string>('AMADEUS_API_URL') || 'https://test.api.amadeus.com'

    const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Amadeus OAuth failed: HTTP ${response.status}`)
    }
  }

  /**
   * AeroDataBox: RapidAPI health endpoint
   */
  private async checkAerodatabox(): Promise<void> {
    const rapidApiKey = this.configService.get<string>('AERODATABOX_RAPIDAPI_KEY')!
    const baseUrl = this.configService.get<string>('AERODATABOX_API_URL') || 'https://aerodatabox.p.rapidapi.com'
    const rapidApiHost = new URL(baseUrl).host

    // Use airport lookup as a lightweight health check (health endpoint returns 400 on some plans)
    const response = await fetch(`${baseUrl}/airports/iata/YYZ`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': rapidApiHost,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`AeroDataBox health failed: HTTP ${response.status}`)
    }
  }

  /**
   * Traveltek: OAuth token acquisition via TraveltekAuthService
   */
  private async checkTraveltek(): Promise<void> {
    if (!this.traveltekAuthService.isConfigured()) {
      throw new Error('Traveltek not configured')
    }
    // getAccessToken() will throw if it fails
    await this.traveltekAuthService.getAccessToken()
  }

  /**
   * Globus: Lightweight search query
   */
  private async checkGlobus(): Promise<void> {
    const baseUrl =
      this.configService.get<string>('GLOBUS_API_URL') ||
      'https://webapi.globusandcosmos.com/gvitawapi.asmx'

    // Use GetLocationKeywords — smallest possible response
    const response = await firstValueFrom(
      this.httpService.get(`${baseUrl}/GetLocationKeywords`, {
        params: { brand: 'Globus' },
        timeout: 10000,
      }),
    )

    if (response.status !== 200) {
      throw new Error(`Globus API failed: HTTP ${response.status}`)
    }
  }

  /**
   * Google Places: Minimal text search request
   */
  private async checkGooglePlaces(): Promise<void> {
    const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY')!

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName',
      },
      body: JSON.stringify({ textQuery: 'hotel', maxResultCount: 1 }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Google Places failed: HTTP ${response.status}`)
    }
  }

  /**
   * Stripe: GET /v1/account
   */
  private async checkStripe(): Promise<void> {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY')!

    const response = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Stripe failed: HTTP ${response.status}`)
    }
  }

  /**
   * Resend: GET /domains
   */
  private async checkResend(): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')!

    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Resend failed: HTTP ${response.status}`)
    }
  }

  /**
   * Unsplash: GET /photos/random?count=1
   */
  private async checkUnsplash(): Promise<void> {
    const accessKey = this.configService.get<string>('UNSPLASH_ACCESS_KEY')!

    const response = await fetch('https://api.unsplash.com/photos/random?count=1', {
      method: 'GET',
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Unsplash failed: HTTP ${response.status}`)
    }
  }

  /**
   * OpenAI: GET /v1/models
   */
  private async checkOpenAI(): Promise<void> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')!

    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`OpenAI failed: HTTP ${response.status}`)
    }
  }

  /**
   * ExchangeRate-API: GET /v6/{key}/latest/CAD
   */
  private async checkExchangeRates(): Promise<void> {
    const apiKey = this.configService.get<string>('EXCHANGE_RATE_API_KEY')!

    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/CAD`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`ExchangeRate-API failed: HTTP ${response.status}`)
    }

    const data = (await response.json()) as { result?: string }
    if (data.result !== 'success') {
      throw new Error(`ExchangeRate-API returned error result`)
    }
  }

  /**
   * Cloudflare R2: HeadBucket via S3-compatible API
   */
  private async checkCloudflareR2(): Promise<void> {
    const accountId = this.configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID')!
    const accessKeyId = this.configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID')!
    const secretAccessKey = this.configService.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY')!
    const bucketName = this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME')!

    // Use AWS SDK S3 HeadBucket — import dynamically to avoid top-level import
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })

    await client.send(new HeadBucketCommand({ Bucket: bucketName }))
    client.destroy()
  }

  /**
   * Supabase Storage: List buckets
   */
  private async checkSupabaseStorage(): Promise<void> {
    const url = this.configService.get<string>('SUPABASE_URL')!
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(`${url}/storage/v1/bucket`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Supabase Storage failed: HTTP ${response.status}`)
    }
  }

  /**
   * Backblaze B2: Authorize account
   */
  private async checkBackblazeB2(): Promise<void> {
    const keyId = this.configService.get<string>('BACKBLAZE_B2_KEY_ID')!
    const applicationKey = this.configService.get<string>('BACKBLAZE_B2_APPLICATION_KEY')!

    const auth = Buffer.from(`${keyId}:${applicationKey}`).toString('base64')
    const response = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Backblaze B2 failed: HTTP ${response.status}`)
    }
  }

  /**
   * Redis: PING
   */
  private async checkRedis(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL')
    const config: { host: string; port: number; password?: string; username?: string; tls?: object } = {
      host: 'localhost',
      port: 6379,
    }

    if (redisUrl) {
      const url = new URL(redisUrl)
      config.host = url.hostname
      config.port = parseInt(url.port || '6379', 10)
      if (url.password) config.password = url.password
      if (url.username) config.username = url.username
      if (url.protocol === 'rediss:') config.tls = {}
    }

    const client = new Redis({
      ...config,
      connectTimeout: 5000,
      lazyConnect: true,
    })

    try {
      await client.connect()
      const pong = await client.ping()
      if (pong !== 'PONG') {
        throw new Error(`Redis PING returned: ${pong}`)
      }
    } finally {
      await client.quit().catch(() => {})
    }
  }

  /**
   * Traveltek FTP: Check env vars exist (lightweight — no actual FTP connection)
   */
  private async checkTraveltekFtp(): Promise<void> {
    // Just verify the env vars are configured. We don't want to open an FTP
    // connection every 15 minutes as it's slow and may cause issues with
    // Traveltek's FTP server connection limits.
    const host = this.configService.get<string>('TRAVELTEK_FTP_HOST')
    const user = this.configService.get<string>('TRAVELTEK_FTP_USER')
    const password = this.configService.get<string>('TRAVELTEK_FTP_PASSWORD')

    if (!host || !user || !password) {
      throw new Error('Traveltek FTP credentials not configured')
    }

    // Do a DNS lookup to verify the host is reachable
    const { promises: dns } = await import('dns')
    await dns.lookup(host)
  }

  // ============================================================================
  // PRIVATE: Notification helpers
  // ============================================================================

  /**
   * Notify all admin users about a provider failure
   */
  private async notifyAdmins(providerKey: string, error?: string): Promise<void> {
    const providerInfo = HEALTH_PROVIDERS.find((p) => p.key === providerKey)
    const providerName = providerInfo?.name ?? providerKey

    try {
      // Find all admin users
      const admins = await this.db.client.query.userProfiles.findMany({
        where: eq(this.db.schema.userProfiles.role, 'admin'),
        columns: { id: true },
      })

      for (const admin of admins) {
        await this.notificationService.send({
          userId: admin.id,
          category: 'system_alerts',
          title: `API Down: ${providerName}`,
          body: `${providerName} has failed 2 consecutive health checks. Last error: ${error ?? 'Unknown'}`,
          actionUrl: '/settings/api-credentials',
        })
      }

      this.logger.warn(`Notified ${admins.length} admins about ${providerName} failure`)
    } catch (err) {
      this.logger.error(`Failed to notify admins about ${providerName} failure: ${err}`)
    }
  }
}
