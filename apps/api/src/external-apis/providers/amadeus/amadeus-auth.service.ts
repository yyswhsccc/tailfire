/**
 * Amadeus Auth Service
 *
 * Shared OAuth2 client credentials authentication for all Amadeus providers.
 * Extracted from duplicated code in amadeus-flights.provider.ts and amadeus-hotels.provider.ts.
 *
 * Features:
 * - Token caching with 60s expiry buffer
 * - Mutex to prevent concurrent token requests
 * - Shared across all Amadeus providers (flights, hotels, transfers, activities)
 */

import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { AmadeusTokenResponse, AmadeusTokenCache } from './amadeus.types'

/**
 * Simple mutex implementation for token request serialization
 */
class SimpleMutex {
  private locked = false
  private waitQueue: (() => void)[] = []

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }
    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve)
    })
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!
      next()
    } else {
      this.locked = false
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/** Buffer time before token expiry (60 seconds) */
const TOKEN_EXPIRY_BUFFER_MS = 60000

@Injectable()
export class AmadeusAuthService {
  private readonly logger = new Logger(AmadeusAuthService.name)
  private tokenCache: AmadeusTokenCache | null = null
  private tokenMutex = new SimpleMutex()

  constructor(private readonly httpService: HttpService) {}

  /**
   * Invalidate the cached token, forcing a fresh fetch on the next request.
   * Call this when a 401 Unauthorized is received to clear a stale token.
   */
  invalidateToken(): void {
    this.tokenCache = null
    this.logger.debug('Amadeus token cache invalidated')
  }

  /**
   * Get a valid OAuth2 access token, using cache when possible.
   * Uses mutex to prevent concurrent token requests.
   * Refreshes token 60 seconds before expiry.
   */
  async getAccessToken(
    baseUrl: string,
    credentials: { clientId: string; clientSecret: string }
  ): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      return this.tokenCache.token
    }

    // Use mutex to prevent concurrent token requests
    return this.tokenMutex.runExclusive(async () => {
      // Double-check after acquiring lock
      if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
        return this.tokenCache.token
      }

      const tokenUrl = `${baseUrl}/v1/security/oauth2/token`
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      })

      try {
        const response = await firstValueFrom(
          this.httpService.post<AmadeusTokenResponse>(tokenUrl, params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
          })
        )

        const tokenData = response.data

        this.logger.debug('Amadeus token acquired', {
          expiresIn: tokenData.expires_in,
          rateLimitRemaining: response.headers['x-ratelimit-remaining'],
        })

        this.tokenCache = {
          token: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        }

        return this.tokenCache.token
      } catch (error: any) {
        this.logger.error('Failed to acquire Amadeus token', {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
        })
        throw new Error(`OAuth2 token acquisition failed: ${error.message}`)
      }
    })
  }
}
