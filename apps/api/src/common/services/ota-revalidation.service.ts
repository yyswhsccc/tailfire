/**
 * OTA Revalidation Service
 *
 * Fire-and-forget POST to the OTA ISR revalidation endpoint when
 * deals or advisor data changes. Invalidates Next.js ISR cache
 * by tag or path so stale pages are rebuilt on next request.
 *
 * Config:
 *   OTA_REVALIDATION_URL — base URL of the OTA app (e.g. http://localhost:3102)
 *   REVALIDATION_SECRET  — shared secret for auth
 *
 * Both must be set for revalidation to fire. If either is missing,
 * all methods silently no-op (safe for envs without an OTA deployment).
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class OtaRevalidationService {
  private readonly logger = new Logger(OtaRevalidationService.name)
  private readonly otaUrl: string
  private readonly secret: string

  constructor(private readonly configService: ConfigService) {
    this.otaUrl = this.configService.get<string>('OTA_REVALIDATION_URL', '')
    this.secret = this.configService.get<string>('REVALIDATION_SECRET', '')
  }

  /**
   * Revalidate all ISR cache entries tagged with `tag`.
   * Example: revalidateTag('deals') invalidates every page that fetched
   * with `{ next: { tags: ['deals'] } }`.
   */
  async revalidateTag(tag: string): Promise<void> {
    if (!this.otaUrl || !this.secret) return
    try {
      await fetch(`${this.otaUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, secret: this.secret }),
      })
      this.logger.debug(`OTA revalidated tag: ${tag}`)
    } catch (error) {
      // Fire-and-forget — log but don't throw
      this.logger.warn(`OTA revalidation failed for tag ${tag}: ${error}`)
    }
  }

  /**
   * Revalidate a specific page path.
   * Example: revalidatePath('/deals/caribbean-cruise') rebuilds that one page.
   */
  async revalidatePath(path: string): Promise<void> {
    if (!this.otaUrl || !this.secret) return
    try {
      await fetch(`${this.otaUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, secret: this.secret }),
      })
      this.logger.debug(`OTA revalidated path: ${path}`)
    } catch (error) {
      this.logger.warn(`OTA revalidation failed for path ${path}: ${error}`)
    }
  }
}
