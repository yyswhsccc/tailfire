/**
 * Credential Resolver Service
 *
 * Resolves API credentials based on per-provider source policy.
 * Implements fail-fast pattern for env-only providers.
 *
 * Source Policies:
 * - env-only: Read from environment variables only. Fail-fast if missing.
 * - db-only: Read from database only (deprecated, for legacy support).
 * - hybrid: Try env first, fall back to DB. Log warning on fallback.
 *
 * Default: env-only with fail-fast (recommended for Doppler-managed secrets)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiProvider } from '@tailfire/shared-types'
import { ConfigurationError } from '../common/errors'
import { ApiCredentialsService } from './api-credentials.service'

/**
 * Credential source policy
 */
export type SourcePolicy = 'env-only' | 'db-only' | 'hybrid'

/**
 * Provider configuration for credential resolution
 */
export interface ProviderCredentialConfig {
  /**
   * Source policy for this provider
   */
  policy: SourcePolicy

  /**
   * Mapping of credential field names to environment variable names
   */
  envVars: Record<string, string>

  /**
   * Required credential fields that must be present
   */
  required: string[]

  /**
   * Whether this provider is shared across all environments (vs env-specific)
   */
  isShared: boolean
}

/**
 * Per-provider credential configuration
 *
 * Defines where each provider's credentials should be loaded from
 * and which environment variables to use.
 */
export const PROVIDER_CREDENTIAL_CONFIG: Record<ApiProvider, ProviderCredentialConfig> = {
  // Third-party APIs (shared across all environments)
  [ApiProvider.UNSPLASH]: {
    policy: 'env-only',
    envVars: { accessKey: 'UNSPLASH_ACCESS_KEY' },
    required: ['accessKey'],
    isShared: true,
  },
  [ApiProvider.AERODATABOX]: {
    policy: 'env-only',
    envVars: { rapidApiKey: 'AERODATABOX_RAPIDAPI_KEY' },
    required: ['rapidApiKey'],
    isShared: true,
  },
  [ApiProvider.AMADEUS]: {
    policy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    required: ['clientId', 'clientSecret'],
    isShared: true,
  },
  [ApiProvider.AMADEUS_ACTIVITIES]: {
    policy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    required: ['clientId', 'clientSecret'],
    isShared: true,
  },
  [ApiProvider.AMADEUS_HOTELS]: {
    policy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    required: ['clientId', 'clientSecret'],
    isShared: true,
  },
  [ApiProvider.AMADEUS_OFFERS]: {
    policy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    required: ['clientId', 'clientSecret'],
    isShared: true,
  },
  [ApiProvider.AMADEUS_TRANSFERS]: {
    policy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    required: ['clientId', 'clientSecret'],
    isShared: true,
  },
  [ApiProvider.GOOGLE_PLACES]: {
    policy: 'env-only',
    envVars: { apiKey: 'GOOGLE_PLACES_API_KEY' },
    required: ['apiKey'],
    isShared: true,
  },
  [ApiProvider.BOOKING_COM]: {
    policy: 'env-only',
    envVars: { rapidApiKey: 'BOOKING_RAPIDAPI_KEY' },
    required: ['rapidApiKey'],
    isShared: true,
  },
  [ApiProvider.OPEN_AI]: {
    policy: 'env-only',
    envVars: { apiKey: 'OPENAI_API_KEY' },
    required: ['apiKey'],
    isShared: true,
  },

  // Storage providers (env-specific secrets)
  [ApiProvider.SUPABASE_STORAGE]: {
    policy: 'env-only',
    envVars: {
      url: 'SUPABASE_URL',
      serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    required: ['url', 'serviceRoleKey'],
    isShared: false,
  },
  [ApiProvider.CLOUDFLARE_R2]: {
    policy: 'env-only',
    envVars: {
      accountId: 'CLOUDFLARE_R2_ACCOUNT_ID',
      accessKeyId: 'CLOUDFLARE_R2_ACCESS_KEY_ID',
      secretAccessKey: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      bucketName: 'CLOUDFLARE_R2_BUCKET_NAME',
      endpoint: 'CLOUDFLARE_R2_ENDPOINT',
    },
    required: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName'],
    isShared: false,
  },
  [ApiProvider.BACKBLAZE_B2]: {
    policy: 'env-only',
    envVars: {
      keyId: 'BACKBLAZE_B2_KEY_ID',
      applicationKey: 'BACKBLAZE_B2_APPLICATION_KEY',
      bucketName: 'BACKBLAZE_B2_BUCKET_NAME',
      endpoint: 'BACKBLAZE_B2_ENDPOINT',
      region: 'BACKBLAZE_B2_REGION',
    },
    required: ['keyId', 'applicationKey', 'bucketName', 'endpoint'],
    isShared: false,
  },
}

@Injectable()
export class CredentialResolverService implements OnModuleInit {
  private readonly logger = new Logger(CredentialResolverService.name)
  private readonly availableProviders = new Set<ApiProvider>()
  private readonly credentialCache = new Map<ApiProvider, Record<string, unknown>>()

  constructor(
    private readonly configService: ConfigService,
    private readonly apiCredentialsService: ApiCredentialsService
  ) {}

  /**
   * Validate all env-only providers have required credentials at startup.
   * This provides early detection of missing configuration.
   */
  onModuleInit() {
    this.logger.log('Validating provider credentials at startup...')

    for (const [provider, config] of Object.entries(PROVIDER_CREDENTIAL_CONFIG)) {
      const apiProvider = provider as ApiProvider

      if (config.policy === 'env-only') {
        const creds = this.getFromEnvironment(apiProvider)
        if (creds) {
          this.availableProviders.add(apiProvider)
          this.credentialCache.set(apiProvider, creds)
          this.logger.log(`✓ ${provider}: credentials configured (${config.isShared ? 'shared' : 'env-specific'})`)
        } else {
          // Log as warning for optional providers (won't fail startup)
          const missingVars = this.getMissingEnvVars(apiProvider)
          this.logger.warn(`✗ ${provider}: missing env vars: ${missingVars.join(', ')}`)
        }
      }
    }

    const availableCount = this.availableProviders.size
    const totalCount = Object.keys(PROVIDER_CREDENTIAL_CONFIG).length
    this.logger.log(`Credential validation complete: ${availableCount}/${totalCount} providers available`)
  }

  /**
   * Resolve credentials for a provider based on its source policy.
   * Throws ConfigurationError for env-only providers if credentials are missing.
   *
   * @param provider - The API provider to resolve credentials for
   * @returns Resolved credentials object
   * @throws ConfigurationError if credentials cannot be resolved
   */
  async resolve(provider: ApiProvider): Promise<Record<string, unknown>> {
    const config = PROVIDER_CREDENTIAL_CONFIG[provider]
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    // Check cache first for env-only providers
    if (config.policy === 'env-only') {
      const cached = this.credentialCache.get(provider)
      if (cached) {
        return cached
      }

      // Try to get from environment
      const creds = this.getFromEnvironment(provider)
      if (creds) {
        this.credentialCache.set(provider, creds)
        return creds
      }

      // Fail-fast for env-only providers
      const missingVars = this.getMissingEnvVars(provider)
      throw ConfigurationError.missingEnvVars(provider, missingVars)
    }

    // Hybrid policy: try env first, fall back to DB
    if (config.policy === 'hybrid') {
      const envCreds = this.getFromEnvironment(provider)
      if (envCreds) {
        return envCreds
      }

      this.logger.warn(`${provider}: falling back to database credentials (env vars not set)`)
      const dbCreds = await this.apiCredentialsService.getDecryptedCredentials(provider)
      if (dbCreds) {
        return dbCreds
      }

      const missingVars = this.getMissingEnvVars(provider)
      throw ConfigurationError.missingEnvVars(provider, missingVars)
    }

    // DB-only policy
    if (config.policy === 'db-only') {
      const dbCreds = await this.apiCredentialsService.getDecryptedCredentials(provider)
      if (dbCreds) {
        return dbCreds
      }

      throw new ConfigurationError(
        `${provider} credentials not found in database. Configure via Admin UI.`,
        provider
      )
    }

    throw new Error(`Unknown policy for provider ${provider}: ${config.policy}`)
  }

  /**
   * Check if a provider has credentials available.
   * Does not throw - returns false if unavailable.
   */
  isAvailable(provider: ApiProvider): boolean {
    return this.availableProviders.has(provider)
  }

  /**
   * Get the source policy for a provider.
   */
  getPolicy(provider: ApiProvider): SourcePolicy {
    return PROVIDER_CREDENTIAL_CONFIG[provider]?.policy ?? 'env-only'
  }

  /**
   * Get the configuration for a provider.
   */
  getProviderConfig(provider: ApiProvider): ProviderCredentialConfig | undefined {
    return PROVIDER_CREDENTIAL_CONFIG[provider]
  }

  /**
   * Get all available providers.
   */
  getAvailableProviders(): ApiProvider[] {
    return Array.from(this.availableProviders)
  }

  /**
   * Refresh credentials from environment (for testing or hot-reload).
   */
  refreshFromEnvironment(provider: ApiProvider): boolean {
    const creds = this.getFromEnvironment(provider)
    if (creds) {
      this.credentialCache.set(provider, creds)
      this.availableProviders.add(provider)
      return true
    }
    this.credentialCache.delete(provider)
    this.availableProviders.delete(provider)
    return false
  }

  /**
   * Get credentials from environment variables.
   * Returns null if any required fields are missing.
   */
  private getFromEnvironment(provider: ApiProvider): Record<string, unknown> | null {
    const config = PROVIDER_CREDENTIAL_CONFIG[provider]
    if (!config) return null

    const result: Record<string, unknown> = {}

    for (const [field, envVar] of Object.entries(config.envVars)) {
      const value = this.configService.get<string>(envVar)
      if (value) {
        result[field] = value
      }
    }

    // Check all required fields are present
    const hasAllRequired = config.required.every((field) => result[field])
    return hasAllRequired ? result : null
  }

  /**
   * Get list of missing required environment variables for a provider.
   */
  private getMissingEnvVars(provider: ApiProvider): string[] {
    const config = PROVIDER_CREDENTIAL_CONFIG[provider]
    if (!config) return []

    const missing: string[] = []
    for (const field of config.required) {
      const envVar = config.envVars[field]
      if (envVar && !this.configService.get<string>(envVar)) {
        missing.push(envVar)
      }
    }
    return missing
  }
}
