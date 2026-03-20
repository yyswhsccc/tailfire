/**
 * External API Registry Service
 *
 * Manages registered API providers with priority-based fallback chains.
 * Handles credential loading and provider selection.
 *
 * Credentials are loaded via CredentialResolverService which supports:
 * - env-only: Doppler-managed environment variables (recommended)
 * - db-only: Admin UI database storage (deprecated)
 * - hybrid: Try env first, fall back to DB
 *
 * Ordering Rules:
 * - Lower priority number = higher priority (1 beats 2)
 * - Alphabetical tie-breaker for same priority
 * - Inactive providers excluded from selection
 * - Providers without credentials excluded from fallback chain
 */

import { Injectable, Logger } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { ApiProvider } from '@tailfire/shared-types'
import { ApiCategory, IExternalApiProvider } from '../interfaces'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import { MetricsService } from './metrics.service'

/**
 * Provider registration metadata
 */
interface ProviderRegistration {
  /** Provider identifier (e.g., 'aerodatabox') */
  provider: string
  /** Priority for fallback ordering (lower = higher priority) */
  priority: number
  /** Whether provider is active */
  isActive: boolean
  /** Whether credentials have been loaded */
  hasCredentials: boolean
}

@Injectable()
export class ExternalApiRegistryService {
  private readonly logger = new Logger(ExternalApiRegistryService.name)

  /**
   * Map of provider keys to provider instances
   * Key format: `{category}_{provider}` (e.g., 'flights_aerodatabox')
   */
  private providers = new Map<string, IExternalApiProvider<any, any>>()

  /**
   * Map of provider keys to registration metadata
   */
  private registrations = new Map<string, ProviderRegistration>()

  /**
   * Map of categories to sorted active provider lists
   */
  private activeProviders = new Map<ApiCategory, ProviderRegistration[]>()

  constructor(
    private readonly credentialResolver: CredentialResolverService,
    private readonly metrics: MetricsService
  ) {}

  /**
   * Register a provider with the registry
   *
   * Immediately loads credentials and rebuilds active provider lists.
   * Call this from provider's onModuleInit().
   *
   * @param provider - Provider instance
   * @param priority - Priority for fallback ordering (default: 100)
   */
  async registerProvider(provider: IExternalApiProvider<any, any>, priority = 100): Promise<void> {
    const key = `${provider.config.category}_${provider.config.provider}`

    this.providers.set(key, provider)
    this.registrations.set(key, {
      provider: provider.config.provider,
      priority,
      isActive: true,
      hasCredentials: false,
    })

    this.logger.log(
      `Registered provider: ${provider.config.provider} for ${provider.config.category} (priority: ${priority})`
    )

    if (process.env.DISABLE_EXTERNAL_API_BOOTSTRAP === 'true') {
      this.logger.warn('External API bootstrap disabled by DISABLE_EXTERNAL_API_BOOTSTRAP')
      this.buildActiveProviderLists()
      return
    }

    // Immediately load credentials for this provider
    await this.loadCredentialsForProvider(key, provider)

    // Rebuild active provider lists
    this.buildActiveProviderLists()
  }

  /**
   * Load credentials for a single provider
   *
   * Uses CredentialResolverService which checks env vars first (Doppler-managed),
   * then falls back to database based on the provider's source policy.
   *
   * @param key - Provider key (category_provider)
   * @param provider - Provider instance
   */
  private async loadCredentialsForProvider(
    key: string,
    provider: IExternalApiProvider<any, any>
  ): Promise<void> {
    const registration = this.registrations.get(key)
    if (!registration) return

    const providerName = provider.config.provider as ApiProvider

    try {
      // Check if credentials are available (validates upfront without throwing)
      if (!this.credentialResolver.isAvailable(providerName)) {
        registration.hasCredentials = false
        const policy = this.credentialResolver.getPolicy(providerName)
        this.logger.warn(
          `No credentials found for ${providerName} (policy: ${policy}). ` +
            `Configure via Doppler or Admin UI.`
        )
        return
      }

      // Resolve credentials using the policy-based resolver
      const credentials = await this.credentialResolver.resolve(providerName)
      await provider.setCredentials(credentials as Record<string, any>)
      registration.hasCredentials = true

      const policy = this.credentialResolver.getPolicy(providerName)
      this.logger.log(`Loaded credentials for ${providerName} (policy: ${policy})`)
    } catch (error: any) {
      registration.hasCredentials = false
      this.logger.error(
        `Failed to load credentials for ${providerName}: ${error.message}`
      )
      Sentry.captureException(error, {
        tags: { service: 'external-api-registry', operation: 'credential-load' },
        extra: { provider: providerName },
      })
    }
  }

  /**
   * Build sorted active provider lists per category
   *
   * Called after credentials loaded and when config changes.
   */
  private buildActiveProviderLists(): void {
    this.activeProviders.clear()

    for (const [key, registration] of this.registrations) {
      if (!registration.isActive) continue

      const provider = this.providers.get(key)
      if (!provider) continue

      const category = provider.config.category
      const list = this.activeProviders.get(category) || []
      list.push(registration)
      this.activeProviders.set(category, list)
    }

    // Sort each category: priority ASC, then provider name ASC (tie-breaker)
    for (const [category, list] of this.activeProviders) {
      list.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return a.provider.localeCompare(b.provider)
      })
      this.logger.log(`Category ${category} providers: ${list.map(p => p.provider).join(' -> ')}`)
    }
  }

  /**
   * Get a provider for a category
   *
   * @param category - API category
   * @param providerName - Optional specific provider name
   * @returns Provider instance or null
   */
  async getProvider<T extends IExternalApiProvider<any, any>>(
    category: ApiCategory,
    providerName?: string
  ): Promise<T | null> {
    // Specific provider requested
    if (providerName) {
      const key = `${category}_${providerName}`
      const provider = this.providers.get(key) as T | undefined
      const registration = this.registrations.get(key)

      if (!provider || !registration?.isActive) {
        this.logger.warn(`Provider ${providerName} not found or inactive for ${category}`)
        return null
      }

      if (!registration.hasCredentials) {
        this.logger.warn(`Provider ${providerName} has no credentials configured`)
        return null
      }

      // Log resolution
      this.logger.debug(`Provider resolved: ${category} -> ${providerName}`)
      return provider
    }

    // Return highest-priority active provider with credentials
    const chain = this.getFallbackChain(category)
    if (chain.length === 0) {
      this.logger.warn(`No providers available for ${category}`)
      return null
    }

    const key = `${category}_${chain[0]}`
    const provider = this.providers.get(key) as T | undefined

    // Log resolution
    this.logger.debug(`Provider resolved: ${category} -> ${chain[0]} (default)`)
    return provider || null
  }

  /**
   * Get fallback chain for a category
   *
   * Returns active providers with credentials, sorted by priority.
   *
   * @param category - API category
   * @returns Array of provider names in priority order
   */
  getFallbackChain(category: ApiCategory): string[] {
    const list = this.activeProviders.get(category) || []
    return list.filter(r => r.isActive && r.hasCredentials).map(r => r.provider)
  }

  /**
   * Execute an operation with fallback to other providers
   *
   * @param category - API category
   * @param operation - Operation to execute with provider
   * @returns Operation result or null if all providers failed
   */
  async tryWithFallback<T>(
    category: ApiCategory,
    operation: (provider: IExternalApiProvider<any, any>) => Promise<T>
  ): Promise<T | null> {
    const chain = this.getFallbackChain(category)
    const isFirstProvider = (idx: number) => idx === 0

    for (let i = 0; i < chain.length; i++) {
      const providerName = chain[i]!
      const provider = await this.getProvider(category, providerName)
      if (!provider) continue // Skip if no credentials

      try {
        this.logger.log(`Trying provider ${providerName} for ${category}`)
        const result = await operation(provider)

        // Record fallback success (only if not the first provider)
        if (!isFirstProvider(i)) {
          this.metrics.recordRequest(providerName, '_fallback', 'fallback')
          this.logger.log(`Fallback to ${providerName} succeeded`)
        }

        return result
      } catch (error: any) {
        this.logger.warn(`Provider ${providerName} failed: ${error.message}, trying next...`)
        // Record fallback attempt failure with proper endpoint label
        this.metrics.recordRequest(providerName, '_fallback', 'error')
        Sentry.captureException(error, {
          tags: { service: 'external-api-registry', operation: 'fallback', provider: providerName },
          extra: { category, fallbackIndex: i, totalProviders: chain.length },
        })
        continue
      }
    }

    this.logger.error(`All providers exhausted for ${category}`)
    return null
  }

  /**
   * Refresh credentials for a specific provider
   *
   * Call this when credentials are updated via Doppler or Admin UI.
   * For env-only providers, this re-reads from environment variables.
   *
   * @param providerName - Provider identifier
   */
  async refreshCredentials(providerName: string): Promise<void> {
    const apiProvider = providerName as ApiProvider

    // Refresh credentials from environment (for env-only providers)
    this.credentialResolver.refreshFromEnvironment(apiProvider)

    for (const [key, provider] of this.providers) {
      if (provider.config.provider !== providerName) continue

      const registration = this.registrations.get(key)
      if (!registration) continue

      try {
        if (!this.credentialResolver.isAvailable(apiProvider)) {
          registration.hasCredentials = false
          this.logger.warn(`No credentials available for ${providerName} after refresh`)
          continue
        }

        const credentials = await this.credentialResolver.resolve(apiProvider)
        await provider.setCredentials(credentials as Record<string, any>)
        registration.hasCredentials = true
        this.logger.log(`Refreshed credentials for ${providerName}`)
      } catch (error: any) {
        registration.hasCredentials = false
        this.logger.error(`Failed to refresh credentials for ${providerName}: ${error.message}`)
        Sentry.captureException(error, {
          tags: { service: 'external-api-registry', operation: 'credential-refresh' },
          extra: { provider: providerName },
        })
      }
    }

    // Rebuild active provider lists
    this.buildActiveProviderLists()
  }

  /**
   * Set provider active/inactive status
   *
   * @param providerName - Provider identifier
   * @param isActive - Whether provider should be active
   */
  setProviderActive(providerName: string, isActive: boolean): void {
    for (const registration of this.registrations.values()) {
      if (registration.provider === providerName) {
        registration.isActive = isActive
        this.logger.log(`Provider ${providerName} set to ${isActive ? 'active' : 'inactive'}`)
      }
    }

    // Rebuild active provider lists
    this.buildActiveProviderLists()
  }

  /**
   * Get all registered providers for a category
   *
   * @param category - API category
   * @returns Array of provider registrations
   */
  getProvidersByCategory(category: ApiCategory): ProviderRegistration[] {
    const result: ProviderRegistration[] = []

    for (const [key, registration] of this.registrations) {
      const provider = this.providers.get(key)
      if (provider?.config.category === category) {
        result.push(registration)
      }
    }

    return result
  }

  /**
   * Get all registered categories
   *
   * @returns Array of categories with at least one provider
   */
  getCategories(): ApiCategory[] {
    const categories = new Set<ApiCategory>()

    for (const provider of this.providers.values()) {
      categories.add(provider.config.category)
    }

    return Array.from(categories)
  }
}
